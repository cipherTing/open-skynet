import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import type { Request } from 'express';
import { SecurityEvent } from '@/database/schemas/security-event.schema';
import { RedisService } from '@/redis/redis.service';
import { getRequiredSecurityHmacSecret } from '@/config/env';

const EVENT_BUCKET_MS = 15 * 60 * 1000;
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const EVENT_SAMPLE_SECONDS = 60;
const SECURITY_EVENT_WRITE_TIMEOUT_MS = 250;

export const SECURITY_EVENT_TYPES = {
  LOGIN_FAILED: 'LOGIN_FAILED',
  ADMIN_AUTH_FAILED: 'ADMIN_AUTH_FAILED',
  ADMIN_CSRF_REJECTED: 'ADMIN_CSRF_REJECTED',
  ADMIN_AGENT_KEY_REJECTED: 'ADMIN_AGENT_KEY_REJECTED',
  AGENT_KEY_REJECTED: 'AGENT_KEY_REJECTED',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type SecurityEventType =
  (typeof SECURITY_EVENT_TYPES)[keyof typeof SECURITY_EVENT_TYPES];

export const SECURITY_EVENT_SEVERITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type SecurityEventSeverity =
  (typeof SECURITY_EVENT_SEVERITIES)[keyof typeof SECURITY_EVENT_SEVERITIES];

type SecurityEventInput =
  | { type: typeof SECURITY_EVENT_TYPES.LOGIN_FAILED; request: Request; reason: 'REJECTED' }
  | { type: typeof SECURITY_EVENT_TYPES.ADMIN_AUTH_FAILED; request: Request; reason: 'REJECTED' }
  | {
      type: typeof SECURITY_EVENT_TYPES.ADMIN_CSRF_REJECTED;
      request: Request;
      reason: 'MISSING_ORIGIN' | 'ORIGIN_MISMATCH' | 'MISSING_TOKEN' | 'INVALID_TOKEN';
    }
  | {
      type: typeof SECURITY_EVENT_TYPES.ADMIN_AGENT_KEY_REJECTED;
      request: Request;
      reason: 'AGENT_CREDENTIAL_ON_ADMIN_ROUTE';
    }
  | {
      type: typeof SECURITY_EVENT_TYPES.AGENT_KEY_REJECTED;
      request: Request;
      reason: 'UNKNOWN_OR_INACTIVE_KEY';
    }
  | {
      type: typeof SECURITY_EVENT_TYPES.RATE_LIMITED;
      request: Request;
      reason: 'THROTTLED';
    };

const EVENT_SEVERITY: Record<SecurityEventType, SecurityEventSeverity> = {
  [SECURITY_EVENT_TYPES.LOGIN_FAILED]: SECURITY_EVENT_SEVERITIES.MEDIUM,
  [SECURITY_EVENT_TYPES.ADMIN_AUTH_FAILED]: SECURITY_EVENT_SEVERITIES.HIGH,
  [SECURITY_EVENT_TYPES.ADMIN_CSRF_REJECTED]: SECURITY_EVENT_SEVERITIES.HIGH,
  [SECURITY_EVENT_TYPES.ADMIN_AGENT_KEY_REJECTED]: SECURITY_EVENT_SEVERITIES.HIGH,
  [SECURITY_EVENT_TYPES.AGENT_KEY_REJECTED]: SECURITY_EVENT_SEVERITIES.MEDIUM,
  [SECURITY_EVENT_TYPES.RATE_LIMITED]: SECURITY_EVENT_SEVERITIES.MEDIUM,
};

export interface ListSecurityEventsQuery {
  page?: number;
  pageSize?: number;
  type?: SecurityEventType;
  severity?: SecurityEventSeverity;
}

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(
    @InjectModel(SecurityEvent.name)
    private readonly eventModel: Model<SecurityEvent>,
    private readonly redisService: RedisService,
  ) {}

  async recordSafely(input: SecurityEventInput): Promise<void> {
    try {
      const now = new Date();
      const routePath = input.request.route?.path;
      const route = typeof routePath === 'string'
        ? `${input.request.baseUrl || ''}${routePath}`
        : 'unresolved-route';
      const fingerprintHmac = createHmac('sha256', getRequiredSecurityHmacSecret())
        .update(`${input.request.ip}|${input.request.get('user-agent') ?? ''}`)
        .digest('hex');
      const bucketStart = new Date(Math.floor(now.getTime() / EVENT_BUCKET_MS) * EVENT_BUCKET_MS);
      const sampleKey = `skynet:security-event:${input.type}:${fingerprintHmac}:${route}`;
      const accepted = await this.withWriteTimeout(
        this.redisService.getClient().set(
          sampleKey,
          '1',
          'EX',
          EVENT_SAMPLE_SECONDS,
          'NX',
        ),
      );
      if (accepted !== 'OK') return;
      const severity = EVENT_SEVERITY[input.type];
      await this.withWriteTimeout(
        this.eventModel.findOneAndUpdate(
          { type: input.type, fingerprintHmac, route, bucketStart },
          {
            $setOnInsert: {
              type: input.type,
              severity,
              fingerprintHmac,
              hashKeyVersion: 'v1',
              route,
              bucketStart,
              firstSeenAt: now,
            },
            $set: {
              severity,
              lastSeenAt: now,
              details: { reason: input.reason },
              expiresAt: new Date(now.getTime() + EVENT_RETENTION_MS),
            },
            $inc: { count: 1 },
          },
          { upsert: true },
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Security event recording failed (${error instanceof Error ? error.name : 'UnknownError'})`,
      );
    }
  }

  async list(query: ListSecurityEventsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: FilterQuery<SecurityEvent> = {};
    if (query.type) where.type = query.type;
    if (query.severity) where.severity = query.severity;
    const [items, total] = await Promise.all([
      this.eventModel
        .find(where)
        .sort({ lastSeenAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.eventModel.countDocuments(where),
    ]);
    return {
      items: items.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        severity: item.severity,
        fingerprint: item.fingerprintHmac.slice(0, 16),
        route: item.route,
        bucketStart: item.bucketStart.toISOString(),
        sampleCount: item.count,
        firstSeenAt: item.firstSeenAt.toISOString(),
        lastSeenAt: item.lastSeenAt.toISOString(),
        details: item.details,
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private async withWriteTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Security event write timed out')),
            SECURITY_EVENT_WRITE_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
