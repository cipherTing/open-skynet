import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { getRequiredAppEncryptionKey } from '@/config/env';

const SECRET_VERSION = 1;

function deriveKey(purpose: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(getRequiredAppEncryptionKey(), 'utf8'),
      Buffer.from('skynet-secret-storage', 'utf8'),
      Buffer.from(purpose, 'utf8'),
      32,
    ),
  );
}

function additionalData(purpose: string, context: string): Buffer {
  return Buffer.from(`${purpose}:${context}:v${SECRET_VERSION}`, 'utf8');
}

export function encryptSecret(value: string, purpose: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(purpose), iv);
  cipher.setAAD(additionalData(purpose, context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${SECRET_VERSION}`,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, purpose: string, context: string): string {
  const [version, ivValue, tagValue, encryptedValue] = payload.split('.');
  if (version !== `v${SECRET_VERSION}` || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Unsupported encrypted secret format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(purpose),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAAD(additionalData(purpose, context));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export const ENCRYPTED_SECRET_VERSION = SECRET_VERSION;
