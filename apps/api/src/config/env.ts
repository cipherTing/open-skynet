const SECURITY_SECRET_NAMES = ['JWT_SECRET', 'APP_ENCRYPTION_KEY'] as const;
type SecuritySecretName = (typeof SECURITY_SECRET_NAMES)[number];

const PUBLIC_SECRET_EXAMPLES = new Set([
  'replace-with-a-strong-random-secret-at-least-32-chars',
  'change-this-jwt-secret-at-least-32-characters',
  'dev-only-insecure-change-me-at-least-32-characters',
  'dev-only-app-encryption-key-at-least-32-characters',
  'replace-with-an-independent-app-encryption-key-32-chars-min',
  'change-this-app-encryption-key-at-least-32-characters',
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

export function getRequiredMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }
  return uri;
}

export function getRequiredJwtSecret(): string {
  return getRequiredSecret('JWT_SECRET');
}

export function getRequiredAppEncryptionKey(): string {
  return getRequiredSecret('APP_ENCRYPTION_KEY');
}

export function validateSecuritySecrets(): void {
  const secrets = SECURITY_SECRET_NAMES.map((name) => getRequiredSecret(name));
  if (new Set(secrets).size !== SECURITY_SECRET_NAMES.length) {
    throw new Error('JWT_SECRET and APP_ENCRYPTION_KEY must use independent values');
  }
}

export function getMongoConnectionOptions(): {
  auth: { username: string; password: string };
  authSource: string;
} {
  const username = process.env.MONGO_USERNAME?.trim();
  const password = process.env.MONGO_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error('MONGO_USERNAME and MONGO_PASSWORD are required');
  }
  return { auth: { username, password }, authSource: 'admin' };
}

export function getRedisPassword(): string {
  const password = process.env.REDIS_PASSWORD?.trim();
  if (!password) {
    throw new Error('REDIS_PASSWORD is required');
  }
  return password;
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
    throw new Error(`${name} environment variable is required`);
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
  return process.env[name]?.trim();
}

export function isSwaggerEnabled(): boolean {
  const explicitValue = process.env.SWAGGER_ENABLED;
  if (explicitValue !== undefined) return explicitValue === 'true';
  return !isProduction();
}
