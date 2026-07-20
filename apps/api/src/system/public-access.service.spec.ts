import { BadRequestException, GoneException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PublicAccessConfig } from '@/database/schemas/public-access-config.schema';
import { RedisService } from '@/redis/redis.service';
import { PublicAccessService } from './public-access.service';
import { Agent } from '@/database/schemas/agent.schema';
import { encryptSecret } from '@/common/security/encrypted-secret';

describe('PublicAccessService', () => {
  let moduleRef: TestingModule;
  let service: PublicAccessService;
  const configModel = { findOne: jest.fn() };
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
  };
  const agentModel = { findById: jest.fn() };
  const previousEncryptionKey = process.env.APP_ENCRYPTION_KEY;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = 'unit-test-app-encryption-key-0123456789-abcdef';
    process.env.JWT_SECRET = 'unit-test-jwt-secret-0123456789-abcdef';
    moduleRef = await Test.createTestingModule({
      providers: [
        PublicAccessService,
        { provide: getModelToken(PublicAccessConfig.name), useValue: configModel },
        { provide: RedisService, useValue: { getClient: () => redis } },
        { provide: getModelToken(Agent.name), useValue: agentModel },
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
    if (previousEncryptionKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previousEncryptionKey;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  });

  it('renders the dynamic Guide with default addresses and a stable ETag', async () => {
    const first = await service.renderAgentGuide();
    const second = await service.renderAgentGuide();
    expect(first.content).toContain('export SKYNET_ORIGIN="http://localhost:8080"');
    expect(first.content).toContain('export SKYNET_API_BASE="http://localhost:8081/api/v1"');
    expect(first.content).not.toContain('{{SKYNET_');
    expect(first.etag).toBe(second.etag);
    expect(first.cacheControl).toBe('private, max-age=60, must-revalidate');
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

  it('consumes a bootstrap only once and injects the matching Agent Key', async () => {
    const agentKey = 'sk_live_bootstrap_secret';
    redis.getdel
      .mockResolvedValueOnce(
        JSON.stringify({
          agentId: 'agent-1',
          keyVersion: 2,
          publicAccessVersion: 0,
          revisitIntervalHours: 12,
        }),
      )
      .mockResolvedValueOnce(null);
    agentModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        id: 'agent-1',
        secretKeyVersion: 2,
        secretKeyCiphertext: encryptSecret(agentKey, 'agent-key', 'agent-1'),
      }),
    });
    const guide = await service.consumeBootstrap('one-time-token');
    const connectionHeader = guide.content.split('\n').slice(0, 12).join('\n');
    expect(connectionHeader).toContain('SKYNET_ORIGIN=http://localhost:8080');
    expect(connectionHeader).toContain('SKYNET_API_BASE=http://localhost:8081/api/v1');
    expect(connectionHeader).toContain(`SKYNET_API_KEY=${agentKey}`);
    expect(guide.content).toContain('每隔 12 小时触发一次回访');
    expect(guide.content).not.toContain('{{AGENT_REVISIT_INTERVAL_HOURS}}');
    expect(guide.cacheControl).toBe('private, no-store');
    await expect(service.consumeBootstrap('one-time-token')).rejects.toBeInstanceOf(GoneException);
  });

  it('renders the default revisit interval for authenticated Agent Guide requests', async () => {
    const guide = await service.renderGuideForAuthenticatedAgent();
    expect(guide.content).toContain('每隔 6 小时触发一次回访');
    expect(guide.content).not.toContain('{{AGENT_REVISIT_INTERVAL_HOURS}}');
  });

  it('rejects a bootstrap created for an older Agent Key version', async () => {
    redis.getdel.mockResolvedValue(
      JSON.stringify({
        agentId: 'agent-1',
        keyVersion: 1,
        publicAccessVersion: 0,
        revisitIntervalHours: 6,
      }),
    );
    agentModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        id: 'agent-1',
        secretKeyVersion: 2,
        secretKeyCiphertext: encryptSecret('new-key', 'agent-key', 'agent-1'),
      }),
    });
    await expect(service.consumeBootstrap('stale-token')).rejects.toBeInstanceOf(GoneException);
  });

  it('rejects a bootstrap after the public access address changes', async () => {
    redis.getdel.mockResolvedValue(
      JSON.stringify({
        agentId: 'agent-1',
        keyVersion: 2,
        publicAccessVersion: 1,
        revisitIntervalHours: 6,
      }),
    );
    await expect(service.consumeBootstrap('old-origin-token')).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(agentModel.findById).not.toHaveBeenCalled();
  });
});
