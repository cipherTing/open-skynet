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
    eval: jest.fn(),
  };
  const agentModel = { findById: jest.fn() };
  const previousEncryptionKey = process.env.APP_ENCRYPTION_KEY;
  const previousJwtSecret = process.env.JWT_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousPublicWebPort = process.env.SKYNET_PUBLIC_WEB_PORT;

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
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    delete process.env.SKYNET_PUBLIC_WEB_PORT;
    configModel.findOne.mockResolvedValue(null);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
  });

  afterAll(async () => {
    await moduleRef.close();
    if (previousEncryptionKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previousEncryptionKey;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousPublicWebPort === undefined) delete process.env.SKYNET_PUBLIC_WEB_PORT;
    else process.env.SKYNET_PUBLIC_WEB_PORT = previousPublicWebPort;
  });

  it('derives a same-origin public API address from the injected public Web port', async () => {
    process.env.SKYNET_PUBLIC_WEB_PORT = '19080';

    await expect(service.getPublicConfig()).resolves.toEqual({
      siteOrigin: 'http://localhost:19080',
      apiBaseUrl: 'http://localhost:19080/api/v1',
      guideUrl: 'http://localhost:19080/guide.md',
      version: 0,
      updatedAt: null,
    });
  });

  it('derives a saved public API address from site origin instead of a legacy stored API URL', async () => {
    process.env.SKYNET_PUBLIC_WEB_PORT = '19080';
    configModel.findOne.mockResolvedValue({
      siteOrigin: 'https://skynet.example.com',
      apiBaseUrl: 'https://api.skynet.example.com/api/v1',
      version: 4,
      updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    });

    await expect(service.getPublicConfig()).resolves.toEqual({
      siteOrigin: 'https://skynet.example.com',
      apiBaseUrl: 'https://skynet.example.com/api/v1',
      guideUrl: 'https://skynet.example.com/guide.md',
      version: 4,
      updatedAt: '2026-08-25T00:00:00.000Z',
    });
  });

  it('renders the dynamic Guide with default addresses and a stable ETag', async () => {
    const first = await service.renderAgentGuide();
    const second = await service.renderAgentGuide();
    expect(first.content).toContain('http://localhost:8080/api/v1');
    expect(first.content).toContain('http://localhost:8080/guide.md');
    expect(first.content).not.toContain('{{SKYNET_');
    expect(first.etag).toBe(second.etag);
    expect(first.cacheControl).toBe('private, max-age=60, must-revalidate');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^skynet:v1:agent-guide:[a-f0-9]{64}:config:[a-f0-9]{64}$/u),
      first.content,
      'EX',
      3600,
    );
  });

  it('does not reuse a cached default Guide after the derived public ports change', async () => {
    const cachedGuides = new Map<string, string>();
    redis.get.mockImplementation((key: string) => Promise.resolve(cachedGuides.get(key) ?? null));
    redis.set.mockImplementation((key: string, value: string) => {
      cachedGuides.set(key, value);
      return Promise.resolve('OK');
    });
    process.env.SKYNET_PUBLIC_WEB_PORT = '19080';

    const first = await service.renderAgentGuide();

    process.env.SKYNET_PUBLIC_WEB_PORT = '29080';
    const second = await service.renderAgentGuide();

    expect(first.content).toContain('http://localhost:19080/api/v1');
    expect(second.content).toContain('http://localhost:29080/api/v1');
    expect(second.content).toContain('http://localhost:29080/guide.md');
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('normalizes the site origin used as the only public address input', () => {
    expect(service.normalizeSiteOrigin('https://skynet.example.com/')).toBe(
      'https://skynet.example.com',
    );
    expect(() => service.normalizeSiteOrigin('https://skynet.example.com/workspace')).toThrow(
      BadRequestException,
    );
  });

  it('allows localhost HTTP settings in production and rejects external HTTP in every environment', () => {
    process.env.NODE_ENV = 'production';

    expect(service.normalizeSiteOrigin('http://localhost:19080')).toBe('http://localhost:19080');

    process.env.NODE_ENV = 'development';
    expect(() => service.normalizeSiteOrigin('http://skynet.example.com')).toThrow(
      BadRequestException,
    );
  });

  it('consumes a bootstrap only once and injects the matching Agent Key', async () => {
    const agentKey = 'sk_live_bootstrap_secret';
    redis.eval
      .mockResolvedValueOnce(
        JSON.stringify({
          tokenHash: 'checked-by-redis-script',
          tokenCiphertext: 'unused-in-consume-test',
          expiresAt: '2099-08-19T08:00:00.000Z',
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
    const guide = await service.consumeBootstrap('agent-1.one-time-token');
    const connectionHeader = guide.content.split('\n').slice(0, 12).join('\n');
    expect(connectionHeader).toContain('SKYNET_ORIGIN=http://localhost:8080');
    expect(connectionHeader).toContain('SKYNET_API_BASE=http://localhost:8080/api/v1');
    expect(connectionHeader).toContain(`SKYNET_API_KEY=${agentKey}`);
    expect(guide.content).toContain('频率：每 12 小时至少一次');
    expect(guide.content).not.toContain('{{AGENT_REVISIT_INTERVAL_HOURS}}');
    expect(guide.cacheControl).toBe('private, no-store');
    await expect(service.consumeBootstrap('agent-1.one-time-token')).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('consumes only the current Agent-scoped bootstrap record', async () => {
    const token = 'agent-1.one-time-secret';
    redis.eval.mockResolvedValue(
      JSON.stringify({
        tokenHash: 'matched-by-the-script',
        tokenCiphertext: 'unused-in-consume-test',
        expiresAt: '2099-08-19T08:00:00.000Z',
        keyVersion: 2,
        publicAccessVersion: 0,
        revisitIntervalHours: 6,
      }),
    );
    agentModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        id: 'agent-1',
        secretKeyVersion: 2,
        secretKeyCiphertext: encryptSecret('sk_live_bootstrap_secret', 'agent-key', 'agent-1'),
      }),
    });

    await expect(service.consumeBootstrap(token)).resolves.toMatchObject({
      cacheControl: 'private, no-store',
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'agent-guide-bootstrap:agent-1',
      expect.any(String),
    );
  });

  it('renders the default revisit interval for authenticated Agent Guide requests', async () => {
    const guide = await service.renderGuideForAuthenticatedAgent();
    expect(guide.content).toContain('频率：每 6 小时至少一次');
    expect(guide.content).not.toContain('{{AGENT_REVISIT_INTERVAL_HOURS}}');
  });

  it('rejects a bootstrap created for an older Agent Key version', async () => {
    redis.eval.mockResolvedValue(
      JSON.stringify({
        tokenHash: 'checked-by-redis-script',
        tokenCiphertext: 'unused-in-consume-test',
        expiresAt: '2099-08-19T08:00:00.000Z',
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
    await expect(service.consumeBootstrap('agent-1.stale-token')).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('rejects a bootstrap after the public access address changes', async () => {
    redis.eval.mockResolvedValue(
      JSON.stringify({
        tokenHash: 'checked-by-redis-script',
        tokenCiphertext: 'unused-in-consume-test',
        expiresAt: '2099-08-19T08:00:00.000Z',
        keyVersion: 2,
        publicAccessVersion: 1,
        revisitIntervalHours: 6,
      }),
    );
    await expect(service.consumeBootstrap('agent-1.old-origin-token')).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(agentModel.findById).not.toHaveBeenCalled();
  });

  it('renders the consumed bootstrap with the same public-access snapshot it validated', async () => {
    redis.eval.mockResolvedValue(
      JSON.stringify({
        tokenHash: 'checked-by-redis-script',
        tokenCiphertext: 'unused-in-consume-test',
        expiresAt: '2099-08-19T08:00:00.000Z',
        keyVersion: 2,
        publicAccessVersion: 0,
        revisitIntervalHours: 6,
      }),
    );
    agentModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        id: 'agent-1',
        secretKeyVersion: 2,
        secretKeyCiphertext: encryptSecret('sk_live_snapshot_secret', 'agent-key', 'agent-1'),
      }),
    });
    const getConfig = jest
      .spyOn(service, 'getPublicConfig')
      .mockResolvedValueOnce({
        siteOrigin: 'https://v1.example',
        apiBaseUrl: 'https://v1.example/api/v1',
        guideUrl: 'https://v1.example/guide.md',
        version: 0,
        updatedAt: null,
      })
      .mockResolvedValueOnce({
        siteOrigin: 'https://v2.example',
        apiBaseUrl: 'https://v2.example/api/v1',
        guideUrl: 'https://v2.example/guide.md',
        version: 1,
        updatedAt: null,
      });

    const guide = await service.consumeBootstrap('agent-1.snapshot-token');

    expect(guide.content).toContain('SKYNET_ORIGIN=https://v1.example');
    expect(guide.content).not.toContain('SKYNET_ORIGIN=https://v2.example');
    getConfig.mockRestore();
  });
});
