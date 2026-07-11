import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { SecurityEvent } from '@/database/schemas/security-event.schema';
import { RedisService } from '@/redis/redis.service';
import { getRequiredSecurityHmacSecret } from '@/config/env';

const EVENT_BUCKET_MS = 15 * 60 * 1000;
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const EVENT_SAMPLE_SECONDS = 60;

export interface SecurityEventParams {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  request: Request;
  details?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class SecurityEventService {
  constructor(
    @InjectModel(SecurityEvent.name)
    private readonly eventModel: Model<SecurityEvent>,
    private readonly redisService: RedisService,
  ) {}

  async recordSampled(params: SecurityEventParams): Promise<void> {
    const now = new Date();
    const route = `${params.request.baseUrl || ''}${params.request.route?.path ?? params.request.path}`;
    const fingerprintHmac = createHmac('sha256', getRequiredSecurityHmacSecret())
      .update(`${params.request.ip}|${params.request.get('user-agent') ?? ''}`)
      .digest('hex');
    const bucketStart = new Date(Math.floor(now.getTime() / EVENT_BUCKET_MS) * EVENT_BUCKET_MS);
    const sampleKey = `skynet:security-event:${params.type}:${fingerprintHmac}:${route}`;

    try {
      const accepted = await this.redisService.getClient().set(
        sampleKey,
        '1',
        'EX',
        EVENT_SAMPLE_SECONDS,
        'NX',
      );
      if (accepted !== 'OK') return;
    } catch {
      return;
    }

    await this.eventModel.findOneAndUpdate(
      { type: params.type, fingerprintHmac, route, bucketStart },
      {
        $setOnInsert: {
          type: params.type,
          severity: params.severity,
          fingerprintHmac,
          hashKeyVersion: 'v1',
          route,
          bucketStart,
          firstSeenAt: now,
        },
        $set: {
          severity: params.severity,
          lastSeenAt: now,
          details: params.details ?? {},
          expiresAt: new Date(now.getTime() + EVENT_RETENTION_MS),
        },
        $inc: { count: 1 },
      },
      { upsert: true },
    );
  }

  async list(page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.eventModel.find().sort({ lastSeenAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      this.eventModel.countDocuments(),
    ]);
    return { items, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }
}
