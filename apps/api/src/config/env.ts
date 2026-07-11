import { readFileSync } from 'node:fs';

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
  const secret = readSecret('JWT_SECRET');
  if (!secret || secret.trim() === '') {
    throw new Error('JWT_SECRET environment variable is required');
  }

  if (secret.length < 32 || secret === 'replace-with-a-strong-random-secret-at-least-32-chars') {
    throw new Error('JWT_SECRET must be at least 32 characters and cannot use the example value');
  }

  return secret;
}

export function getRequiredAgentKeyPepper(): string {
  return getRequiredSecret('AGENT_KEY_PEPPER');
}

export function getRequiredSecurityHmacSecret(): string {
  return getRequiredSecret('SECURITY_HMAC_SECRET');
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

function getRequiredSecret(name: string): string {
  const secret = readSecret(name);
  if (!secret || secret.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  return secret;
}

function readSecret(name: string): string | undefined {
  const filePath = process.env[`${name}_FILE`]?.trim();
  if (filePath) {
    return readFileSync(filePath, 'utf8').trim();
  }
  return process.env[name]?.trim();
}

export function isSwaggerEnabled(): boolean {
  const explicitValue = process.env.SWAGGER_ENABLED;
  if (explicitValue !== undefined) return explicitValue === 'true';
  return !isProduction();
}
