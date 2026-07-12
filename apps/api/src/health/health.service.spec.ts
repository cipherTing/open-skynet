import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { RedisService } from '@/redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let moduleRef: TestingModule;
  let service: HealthService;
  const mongoPing = jest.fn();
  const mongoCommand = jest.fn();
  const redisPing = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    mongoPing.mockResolvedValue({ ok: 1 });
    mongoCommand.mockResolvedValue({ ok: 1, setName: 'rs0', isWritablePrimary: true });
    redisPing.mockResolvedValue('PONG');
    moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: getConnectionToken(),
          useValue: {
            db: { admin: () => ({ ping: mongoPing, command: mongoCommand }) },
          },
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
    expect(mongoCommand).toHaveBeenCalledWith({ hello: 1 });
    expect(redisPing).toHaveBeenCalledTimes(1);
  });

  it('returns 503 semantics when a dependency is unavailable', async () => {
    redisPing.mockRejectedValueOnce(new Error('redis unavailable'));
    await expect(service.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is not ready when MongoDB is not a replica set', async () => {
    mongoCommand.mockResolvedValueOnce({ ok: 1, isWritablePrimary: true });
    await expect(service.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is not ready when the replica set has no writable primary', async () => {
    mongoCommand.mockResolvedValueOnce({ ok: 1, setName: 'rs0', isWritablePrimary: false });
    await expect(service.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is not ready when replica set inspection fails', async () => {
    mongoCommand.mockRejectedValueOnce(new Error('hello failed'));
    await expect(service.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
