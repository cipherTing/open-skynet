import { readFileSync } from 'node:fs';

const SECURITY_SECRET_NAMES = [
  'JWT_SECRET',
  'AGENT_KEY_PEPPER',
  'SECURITY_HMAC_SECRET',
  'INITIALIZATION_KEY',
] as const;
const secretFileCache = new Map<string, string>();

type SecuritySecretName = (typeof SECURITY_SECRET_NAMES)[number];

const PUBLIC_SECRET_EXAMPLES = new Set([
  'replace-with-a-strong-random-secret-at-least-32-chars',
  'replace-with-an-independent-agent-key-pepper-32-chars-min',
  'replace-with-an-independent-security-hmac-secret-32-chars-min',
  'dev-only-insecure-change-me-at-least-32-characters',
  'dev-only-agent-key-pepper-at-least-32-characters',
  'dev-only-security-hmac-at-least-32-characters',
  'dev-only-initialization-key-at-least-32-characters',
  'replace-with-an-independent-initialization-key-32-chars-min',
]);

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function getRedisConfig(): { host: string; port: number } {
  const host = process.env.REDIS_HOST || 'redis';
  const rawPort = process.env.REDIS_PORT || '6379';
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`REDIS_PORT must be a valid TCP port, received ${rawPort}`);
  }

  return { host, port };
}

export function getRequiredJwtSecret(): string {
  return getRequiredSecret('JWT_SECRET');
}

export function getRequiredAgentKeyPepper(): string {
  return getRequiredSecret('AGENT_KEY_PEPPER');
}

export function getRequiredSecurityHmacSecret(): string {
  return getRequiredSecret('SECURITY_HMAC_SECRET');
}

export function getRequiredInitializationKey(): string {
  return getRequiredSecret('INITIALIZATION_KEY');
}

export function validateSecuritySecrets(): void {
  const secrets = SECURITY_SECRET_NAMES.map((name) => getRequiredSecret(name));
  if (new Set(secrets).size !== SECURITY_SECRET_NAMES.length) {
    throw new Error(
      'JWT_SECRET, AGENT_KEY_PEPPER, SECURITY_HMAC_SECRET, and INITIALIZATION_KEY must use independent values',
    );
  }
}

export function getTrustProxySetting(): number | string | false {
  const rawValue = process.env.TRUST_PROXY?.trim();
  if (!rawValue || rawValue === 'false') return false;

  const hopCount = Number(rawValue);
  if (Number.isInteger(hopCount) && hopCount > 0 && hopCount <= 10) {
    return hopCount;
  }

  if (/^(loopback|linklocal|uniquelocal)$/.test(rawValue)) {
    return rawValue;
  }

  if (/^[a-fA-F0-9:./, ]+$/.test(rawValue)) {
    return rawValue;
  }

  throw new Error('TRUST_PROXY must be a hop count or an explicit trusted subnet list');
}

function getRequiredSecret(name: SecuritySecretName): string {
  const secret = readSecret(name);
  if (!secret) {
    throw new Error(`${name} environment variable or ${name}_FILE is required`);
  }
  if (secret.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  if (isProduction() && PUBLIC_SECRET_EXAMPLES.has(secret)) {
    throw new Error(`${name} cannot use a public example value in production`);
  }
  return secret;
}

function readSecret(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`]?.trim();
  if (filePath) {
    if (secretFileCache.has(filePath)) return secretFileCache.get(filePath);
    const secret = readFileSync(filePath, 'utf8').trim();
    secretFileCache.set(filePath, secret);
    return secret;
  }
  return process.env[name]?.trim();
}

export function isSwaggerEnabled(): boolean {
  const explicitValue = process.env.SWAGGER_ENABLED;
  if (explicitValue !== undefined) return explicitValue === 'true';
  return !isProduction();
}
