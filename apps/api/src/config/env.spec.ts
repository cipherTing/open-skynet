import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import {
  getMongoConnectionOptions,
  getRedisPassword,
  getRequiredAppEncryptionKey,
  getRequiredJwtSecret,
  getRequiredMongoUri,
  validateSecuritySecrets,
} from './env';

const SECRET_NAMES = ['JWT_SECRET', 'APP_ENCRYPTION_KEY'] as const;
type SecretName = (typeof SECRET_NAMES)[number];

const ORIGINAL_ENVIRONMENT = new Map<string, string | undefined>(
  [
    'NODE_ENV',
    'MONGODB_URI',
    'MONGO_USERNAME',
    'MONGO_PASSWORD',
    'REDIS_PASSWORD',
    ...SECRET_NAMES,
  ].map((name) => [name, process.env[name]]),
);

const VALID_SECRETS: Record<SecretName, string> = {
  JWT_SECRET: 'unit-test-jwt-secret-0123456789-abcdef',
  APP_ENCRYPTION_KEY: 'unit-test-app-encryption-key-0123456789-abcdef',
};

interface PublicSecretCase {
  source: string;
  name: SecretName;
  value: string;
}

function loadEnvironmentExample(fileName: string): Record<string, string> {
  return parse(readFileSync(resolve(__dirname, '../../../../', fileName)));
}

const DEVELOPMENT_EXAMPLE = loadEnvironmentExample('.env.dev.example');
const PRODUCTION_EXAMPLE = loadEnvironmentExample('.env.example');
const PUBLIC_SECRET_CASES: PublicSecretCase[] = [
  ...SECRET_NAMES.map((name) => ({
    source: '.env.dev.example',
    name,
    value: DEVELOPMENT_EXAMPLE[name],
  })),
  ...SECRET_NAMES.map((name) => ({
    source: '.env.example',
    name,
    value: PRODUCTION_EXAMPLE[name],
  })),
];

describe('security secret validation', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    for (const name of SECRET_NAMES) process.env[name] = VALID_SECRETS[name];
    delete process.env.MONGODB_URI;
    delete process.env.MONGO_USERNAME;
    delete process.env.MONGO_PASSWORD;
    delete process.env.REDIS_PASSWORD;
  });

  afterAll(() => {
    for (const [name, value] of ORIGINAL_ENVIRONMENT) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it.each(SECRET_NAMES)('requires %s', (name) => {
    delete process.env[name];
    expect(() => validateSecuritySecrets()).toThrow(`${name} environment variable is required`);
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

  it('requires independent values', () => {
    process.env.APP_ENCRYPTION_KEY = process.env.JWT_SECRET;
    expect(() => validateSecuritySecrets()).toThrow('must use independent values');
  });

  it('accepts direct environment values', () => {
    expect(() => validateSecuritySecrets()).not.toThrow();
    expect(getRequiredJwtSecret()).toBe(VALID_SECRETS.JWT_SECRET);
    expect(getRequiredAppEncryptionKey()).toBe(VALID_SECRETS.APP_ENCRYPTION_KEY);
  });

  it('reads MongoDB credentials as driver authentication options', () => {
    process.env.NODE_ENV = 'development';
    process.env.MONGO_USERNAME = 'skynet';
    process.env.MONGO_PASSWORD = 'mongo-password';
    expect(getMongoConnectionOptions()).toEqual({
      auth: { username: 'skynet', password: 'mongo-password' },
      authSource: 'admin',
    });
  });

  it('requires the MongoDB connection URI', () => {
    expect(() => getRequiredMongoUri()).toThrow('MONGODB_URI is required');
    process.env.MONGODB_URI = 'mongodb://mongo:27017/skynet?replicaSet=rs0';
    expect(getRequiredMongoUri()).toBe('mongodb://mongo:27017/skynet?replicaSet=rs0');
  });

  it('requires MongoDB credentials in every environment', () => {
    expect(() => getMongoConnectionOptions()).toThrow(
      'MONGO_USERNAME and MONGO_PASSWORD are required',
    );
  });

  it('reads the Redis password directly from the environment', () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_PASSWORD = 'redis-password';
    expect(getRedisPassword()).toBe('redis-password');
  });

  it('requires the Redis password in every environment', () => {
    expect(() => getRedisPassword()).toThrow('REDIS_PASSWORD is required');
  });
});
