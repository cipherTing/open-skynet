import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import type { Request } from 'express';
import { SecurityEvent } from '@/database/schemas/security-event.schema';
import { RedisService } from '@/redis/redis.service';
import {
  SECURITY_EVENT_REASONS,
  SECURITY_EVENT_TYPES,
  SecurityEventService,
} from './security-event.service';

describe('SecurityEventService', () => {
  let service: SecurityEventService;
  const eventModel = { findOneAndUpdate: jest.fn() };
  const redisClient = { set: jest.fn(), eval: jest.fn() };
  const request = {
    ip: '127.0.0.1',
    baseUrl: '/api/v1/auth',
    route: { path: '/login' },
    get: jest.fn((name: string) => (name === 'user-agent' ? 'test-agent' : undefined)),
  } as unknown as Request;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters';
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityEventService,
        { provide: getModelToken(SecurityEvent.name), useValue: eventModel },
        { provide: RedisService, useValue: { getClient: () => redisClient } },
      ],
    }).compile();
    service = moduleRef.get(SecurityEventService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.set.mockResolvedValue('OK');
    redisClient.eval.mockResolvedValue(1);
    eventModel.findOneAndUpdate.mockResolvedValue({});
  });

  it('stores only the closed reason payload and a route template', async () => {
    await service.record({
      type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
      request,
      reason: SECURITY_EVENT_REASONS.REJECTED,
    });
    expect(eventModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/v1/auth/login' }),
      expect.objectContaining({
        $setOnInsert: expect.not.objectContaining({ severity: expect.anything() }),
        $set: expect.objectContaining({ details: { reason: 'REJECTED' } }),
      }),
      { upsert: true },
    );
  });

  it('propagates Redis and Mongo persistence failures', async () => {
    redisClient.set.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(
      service.record({
        type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
        request,
        reason: SECURITY_EVENT_REASONS.REJECTED,
      }),
    ).rejects.toMatchObject({ status: 503 });

    redisClient.set.mockResolvedValueOnce('OK');
    eventModel.findOneAndUpdate.mockRejectedValueOnce(new Error('mongo unavailable'));
    await expect(
      service.record({
        type: SECURITY_EVENT_TYPES.LOGIN_FAILED,
        request,
        reason: SECURITY_EVENT_REASONS.REJECTED,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(redisClient.eval).toHaveBeenCalledTimes(1);
  });
});
