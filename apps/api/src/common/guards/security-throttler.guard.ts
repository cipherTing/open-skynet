import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import {
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from '@/system/security-event.service';
import { apiErrors } from '@/common/i18n/api-message';

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

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    await this.securityEventService.recordSafely({
      type: SECURITY_EVENT_TYPES.RATE_LIMITED,
      request,
      reason: 'THROTTLED',
    });
    throw apiErrors.tooManyRequests('RATE_LIMITED', 'api.errors.rateLimited', {
      details: { retryAfterSeconds: Math.max(1, Math.ceil(throttlerLimitDetail.ttl / 1000)) },
    });
  }
}
