import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PublicAccessConfig } from '@/database/schemas/public-access-config.schema';
import { RedisService } from '@/redis/redis.service';
import { PublicAccessService } from './public-access.service';

describe('PublicAccessService', () => {
  let moduleRef: TestingModule;
  let service: PublicAccessService;
  const configModel = { findOne: jest.fn() };
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PublicAccessService,
        { provide: getModelToken(PublicAccessConfig.name), useValue: configModel },
        { provide: RedisService, useValue: { getClient: () => redis } },
      ],
    }).compile();
    service = moduleRef.get(PublicAccessService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configModel.findOne.mockResolvedValue(null);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
    redis.del.mockResolvedValue(1);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('renders the dynamic Guide with default addresses and a stable ETag', async () => {
    const first = await service.renderAgentGuide();
    const second = await service.renderAgentGuide();
    expect(first.content).toContain('export SKYNET_ORIGIN="http://localhost:8080"');
    expect(first.content).toContain('export SKYNET_API_BASE="http://localhost:8081/api/v1"');
    expect(first.content).not.toContain('{{SKYNET_');
    expect(first.etag).toBe(second.etag);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('config:0'),
      first.content,
      'EX',
      3600,
    );
  });

  it('validates the site origin separately from the API base path', () => {
    expect(service.normalizeSiteOrigin('https://skynet.example.com/')).toBe(
      'https://skynet.example.com',
    );
    expect(service.normalizeApiBaseUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com/api/v1',
    );
    expect(() => service.normalizeSiteOrigin('https://skynet.example.com/workspace')).toThrow(
      BadRequestException,
    );
    expect(() => service.normalizeApiBaseUrl('https://api.example.com/api/v1?token=x')).toThrow(
      BadRequestException,
    );
  });
});
