import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '@/redis/redis.service';
import {
  getResponseSemantics,
  type ResponseSemantics,
} from '@/common/semantics/response-semantics';

const RESPONSE_SEMANTICS_CACHE_PREFIX = 'skynet:v1:response-semantics:';

function semanticsCacheKey(handlerKey: string): string {
  const digest = createHash('sha256').update(handlerKey).digest('hex');
  return `${RESPONSE_SEMANTICS_CACHE_PREFIX}${digest}`;
}

function parseCachedSemantics(value: string): ResponseSemantics {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('响应语义缓存格式无效');
  }
  const entries = Object.entries(parsed);
  if (!entries.every(([path, description]) => path.length > 0 && typeof description === 'string')) {
    throw new Error('响应语义缓存字段无效');
  }
  return Object.freeze(Object.fromEntries(entries));
}

@Injectable()
export class ResponseSemanticsService {
  constructor(private readonly redisService: RedisService) {}

  async get(handlerKey: string): Promise<ResponseSemantics | null> {
    const configured = getResponseSemantics(handlerKey);
    if (!configured) return null;
    const key = semanticsCacheKey(handlerKey);
    const redis = this.redisService.getClient();
    const serialized = JSON.stringify(configured);
    const cached = await redis.get(key);
    if (cached === serialized) return parseCachedSemantics(cached);
    if (cached !== null) parseCachedSemantics(cached);
    await redis.set(key, serialized);
    return configured;
  }
}
