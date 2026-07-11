import { createHmac, timingSafeEqual } from 'node:crypto';
import type { User } from '@/database/schemas/user.schema';
import { getRequiredAgentKeyPepper, getRequiredSecurityHmacSecret } from '@/config/env';

export function digestAgentKey(secretKey: string): string {
  return createHmac('sha256', getRequiredAgentKeyPepper())
    .update(secretKey)
    .digest('hex');
}

export function isUserSuspended(
  user: Pick<User, 'suspendedAt' | 'suspendedUntil'>,
  now = new Date(),
): boolean {
  if (!user.suspendedAt) return false;
  return user.suspendedUntil === null || user.suspendedUntil.getTime() > now.getTime();
}

export function hashOpaqueToken(token: string): string {
  return createHmac('sha256', getRequiredSecurityHmacSecret()).update(token).digest('hex');
}

export function secureTokenMatches(rawToken: string, expectedHash: string): boolean {
  const actualHash = hashOpaqueToken(rawToken);
  const actual = Buffer.from(actualHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
