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
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
