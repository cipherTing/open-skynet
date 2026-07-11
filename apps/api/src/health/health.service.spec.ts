import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { RedisService } from '@/redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let moduleRef: TestingModule;
  let service: HealthService;
  const mongoPing = jest.fn();
  const redisPing = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    mongoPing.mockResolvedValue({ ok: 1 });
    redisPing.mockResolvedValue('PONG');
    moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: getConnectionToken(),
          useValue: { db: { admin: () => ({ ping: mongoPing }) } },
        },
        {
          provide: RedisService,
          useValue: { getClient: () => ({ ping: redisPing }) },
        },
      ],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('keeps liveness independent from external dependencies', () => {
    expect(service.live()).toEqual({ status: 'live' });
  });

  it('returns ready only when MongoDB and Redis respond', async () => {
    await expect(service.ready()).resolves.toEqual({ status: 'ready' });
    expect(mongoPing).toHaveBeenCalledTimes(1);
    expect(redisPing).toHaveBeenCalledTimes(1);
  });

  it('returns 503 semantics when a dependency is unavailable', async () => {
    redisPing.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(service.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
