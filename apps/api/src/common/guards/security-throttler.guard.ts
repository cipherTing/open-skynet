import { createHash } from 'node:crypto';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import {
  SECURITY_EVENT_REASONS,
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';
import { apiErrors } from '@/common/i18n/api-message';
import { AUTH_TYPES } from '@/auth/interfaces/jwt-auth-user.interface';

const THROTTLE_TRACKER_PREFIXES = {
  OWNER: 'owner',
  IP: 'ip',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getOwnerId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (value.authType !== AUTH_TYPES.BROWSER && value.authType !== AUTH_TYPES.AGENT) return null;
  return typeof value.userId === 'string' && value.userId.length > 0 ? value.userId : null;
}

export function buildSecurityThrottleTracker(user: unknown, ip: string | undefined): string {
  const ownerId = getOwnerId(user);
  if (ownerId) return `${THROTTLE_TRACKER_PREFIXES.OWNER}:${ownerId}`;
  const normalizedIp = ip?.trim();
  if (!normalizedIp) throw new Error('限流无法取得可信客户端 IP');
  const ipDigest = createHash('sha256').update(normalizedIp).digest('hex');
  return `${THROTTLE_TRACKER_PREFIXES.IP}:${ipDigest}`;
}

@Injectable()
export class SecurityThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly securityEventService: SecurityEventService,
  ) {
    super(options, storageService, reflector);
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = typeof req.ip === 'string' ? req.ip : undefined;
    return Promise.resolve(buildSecurityThrottleTracker(req.user, ip));
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    const retryAfterSeconds = Math.max(1, Math.ceil(throttlerLimitDetail.timeToBlockExpire));
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(retryAfterSeconds));
    try {
      await this.securityEventService.record({
        type: SECURITY_EVENT_TYPES.RATE_LIMITED,
        request,
        reason: SECURITY_EVENT_REASONS.THROTTLED,
      });
    } catch (error) {
      response.removeHeader('Retry-After');
      throw error;
    }
    throw apiErrors.tooManyRequests('RATE_LIMITED', 'api.errors.rateLimited', {
      details: {
        retryAfterSeconds,
      },
    });
  }
}
