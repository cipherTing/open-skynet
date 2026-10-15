import { SetMetadata } from '@nestjs/common';

export const PRE_AUTH_THROTTLE_KEY = 'security:pre-auth-throttle';

export interface PreAuthThrottleOptions {
  name: string;
  ttlMs: number;
  limit: number;
  blockDurationMs: number;
}

export const PreAuthThrottle = (options?: PreAuthThrottleOptions) =>
  SetMetadata(PRE_AUTH_THROTTLE_KEY, options ?? true);
