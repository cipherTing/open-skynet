import * as fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';
import {
  getRequiredAgentKeyPepper,
  getRequiredJwtSecret,
  getRequiredSecurityHmacSecret,
  validateSecuritySecrets,
} from './env';

const SECRET_NAMES = ['JWT_SECRET', 'AGENT_KEY_PEPPER', 'SECURITY_HMAC_SECRET'] as const;

type SecretName = (typeof SECRET_NAMES)[number];

const ORIGINAL_ENVIRONMENT = new Map<string, string | undefined>(
  ['NODE_ENV', ...SECRET_NAMES, ...SECRET_NAMES.map((name) => `${name}_FILE`)].map((name) => [
    name,
    process.env[name],
  ]),
);

const VALID_SECRETS: Record<SecretName, string> = {
  JWT_SECRET: 'unit-test-jwt-secret-0123456789-abcdef',
  AGENT_KEY_PEPPER: 'unit-test-agent-pepper-0123456789-abcdef',
  SECURITY_HMAC_SECRET: 'unit-test-security-hmac-0123456789-abcdef',
};
const TEMPORARY_DIRECTORIES: string[] = [];

function createSecretFile(value: string): string {
  const directory = fs.mkdtempSync(join(tmpdir(), 'skynet-env-'));
  TEMPORARY_DIRECTORIES.push(directory);
  const filePath = join(directory, 'secret');
  fs.writeFileSync(filePath, value);
  return filePath;
}

interface PublicSecretCase {
  source: string;
  name: SecretName;
  value: string;
}

function fromRepositoryRoot(fileName: string): string {
  return resolve(__dirname, '../../../../', fileName);
}

function loadEnvironmentExample(fileName: string): Record<string, string> {
  return parse(readFileSync(resolve(__dirname, '../../../../', fileName)));
}

const DEVELOPMENT_EXAMPLE = loadEnvironmentExample('.env.dev.example');
const PUBLIC_SECRET_CASES: PublicSecretCase[] = [
  ...SECRET_NAMES.map((name) => ({
    source: '.env.dev.example',
    name,
    value: DEVELOPMENT_EXAMPLE[name],
  })),
  {
    source: 'secrets/jwt_secret.example',
    name: 'JWT_SECRET',
    value: readFileSync(fromRepositoryRoot('secrets/jwt_secret.example'), 'utf8').trim(),
  },
  {
    source: 'secrets/agent_key_pepper.example',
    name: 'AGENT_KEY_PEPPER',
    value: readFileSync(fromRepositoryRoot('secrets/agent_key_pepper.example'), 'utf8').trim(),
  },
  {
    source: 'secrets/security_hmac_secret.example',
    name: 'SECURITY_HMAC_SECRET',
    value: readFileSync(fromRepositoryRoot('secrets/security_hmac_secret.example'), 'utf8').trim(),
  },
];

describe('security secret validation', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    for (const name of SECRET_NAMES) {
      process.env[name] = VALID_SECRETS[name];
      delete process.env[`${name}_FILE`];
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const directory of TEMPORARY_DIRECTORIES.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    for (const [name, value] of ORIGINAL_ENVIRONMENT) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it.each(SECRET_NAMES)('requires %s', (name) => {
    delete process.env[name];
    expect(() => validateSecuritySecrets()).toThrow(
      `${name} environment variable or ${name}_FILE is required`,
    );
  });

  it.each(SECRET_NAMES)('rejects a short %s', (name) => {
    process.env[name] = 'too-short';
    expect(() => validateSecuritySecrets()).toThrow(`${name} must be at least 32 characters`);
  });

  it.each(PUBLIC_SECRET_CASES)(
    'rejects $name from $source during production startup',
    ({ name, value }) => {
      process.env[name] = value;
      expect(() => validateSecuritySecrets()).toThrow(
        `${name} cannot use a public example value in production`,
      );
    },
  );

  it('requires three independent values', () => {
    process.env.SECURITY_HMAC_SECRET = process.env.JWT_SECRET;
    expect(() => validateSecuritySecrets()).toThrow('must use independent values');
  });

  it('accepts three independent non-public secrets', () => {
    expect(() => validateSecuritySecrets()).not.toThrow();
    expect(getRequiredJwtSecret()).toBe(VALID_SECRETS.JWT_SECRET);
    expect(getRequiredAgentKeyPepper()).toBe(VALID_SECRETS.AGENT_KEY_PEPPER);
    expect(getRequiredSecurityHmacSecret()).toBe(VALID_SECRETS.SECURITY_HMAC_SECRET);
  });

  it('prefers and caches a secret file by path', () => {
    const firstValue = 'file-backed-jwt-secret-0123456789-abcdef';
    const filePath = createSecretFile(firstValue);
    process.env.JWT_SECRET_FILE = filePath;
    process.env.JWT_SECRET = 'environment-jwt-secret-0123456789-abcdef';
    expect(getRequiredJwtSecret()).toBe(firstValue);
    fs.writeFileSync(filePath, 'changed-file-jwt-secret-0123456789-abcdef');
    expect(getRequiredJwtSecret()).toBe(firstValue);
  });

  it('reads a new file when the configured path changes', () => {
    const firstPath = createSecretFile('first-path-jwt-secret-0123456789-abcdef');
    const secondPath = createSecretFile('second-path-jwt-secret-0123456789-abcdef');
    process.env.JWT_SECRET_FILE = firstPath;
    expect(getRequiredJwtSecret()).toContain('first-path');

    process.env.JWT_SECRET_FILE = secondPath;
    expect(getRequiredJwtSecret()).toContain('second-path');
  });

  it('reads direct environment values live after removing the file source', () => {
    process.env.JWT_SECRET_FILE = createSecretFile('file-source-jwt-secret-0123456789-abcdef');
    expect(getRequiredJwtSecret()).toContain('file-source');

    delete process.env.JWT_SECRET_FILE;
    process.env.JWT_SECRET = 'first-live-jwt-secret-0123456789-abcdef';
    expect(getRequiredJwtSecret()).toContain('first-live');
    process.env.JWT_SECRET = 'second-live-jwt-secret-0123456789-abcdef';
    expect(getRequiredJwtSecret()).toContain('second-live');
  });

  it('does not cache failed file reads', () => {
    const missingPath = join(tmpdir(), `skynet-missing-secret-${Date.now()}`);
    process.env.JWT_SECRET_FILE = missingPath;
    expect(() => getRequiredJwtSecret()).toThrow();
    fs.writeFileSync(missingPath, 'recovered-file-jwt-secret-0123456789-abcdef');
    expect(getRequiredJwtSecret()).toContain('recovered-file');
    fs.rmSync(missingPath, { force: true });
  });
});
