import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { RedisService } from '@/redis/redis.service';
import { PublicAccessService } from '@/system/public-access.service';
import { UserService } from './user.service';

describe('UserService Agent Key operations', () => {
  jest.setTimeout(120_000);
  let mongo: MongoMemoryServer;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: UserService;
  const redis = { del: jest.fn(), eval: jest.fn(), get: jest.fn(), set: jest.fn() };
  const publicAccess = { getPublicConfig: jest.fn() };
  const previousEncryptionKey = process.env.APP_ENCRYPTION_KEY;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = 'unit-test-app-encryption-key-0123456789-abcdef';
    process.env.JWT_SECRET = 'unit-test-jwt-secret-0123456789-abcdef';
    mongo = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: Agent.name, schema: AgentSchema }]),
      ],
      providers: [
        UserService,
        { provide: RedisService, useValue: { getClient: () => redis } },
        { provide: PublicAccessService, useValue: publicAccess },
      ],
    }).compile();
    connection = moduleRef.get(getConnectionToken());
    service = moduleRef.get(UserService);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await connection.db?.dropDatabase();
    await connection.model(Agent.name).syncIndexes();
    redis.set.mockResolvedValue('OK');
    redis.get.mockResolvedValue(null);
    redis.del.mockResolvedValue(1);
    redis.eval.mockResolvedValue(1);
    publicAccess.getPublicConfig.mockResolvedValue({
      guideUrl: 'https://community.example.com/guide.md',
      version: 6,
    });
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
    if (previousEncryptionKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previousEncryptionKey;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  });

  it('advances the Key version once for every successful concurrent rotation', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'ConcurrentAgent',
      userId: 'user-1',
    });
    const results = await Promise.allSettled([
      service.regenerateKey(agent.id),
      service.regenerateKey(agent.id),
    ]);
    const successfulRotations = results.filter((result) => result.status === 'fulfilled');
    expect(successfulRotations.length).toBeGreaterThanOrEqual(1);
    const updated = await connection
      .model(Agent.name)
      .findById(agent.id)
      .select('+secretKeyCiphertext');
    expect(updated?.secretKeyVersion).toBe(successfulRotations.length);
    expect(updated?.secretKeyCiphertext).toBeTruthy();
  });

  it('trims the public name and allows the public description to be cleared', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'ProfileAgent',
      description: 'old description',
      userId: 'profile-user',
    });
    const updated = await service.updateAgent(agent.id, {
      name: '  Renamed Agent  ',
      description: '   ',
    });
    expect(updated).toMatchObject({ name: 'Renamed Agent', description: '' });
    const stored = await connection.model(Agent.name).findById(agent.id);
    expect(stored).toMatchObject({ name: 'Renamed Agent', description: '' });
  });

  it('rejects a public name already used by another active Agent', async () => {
    await connection.model(Agent.name).create({ name: 'Existing Agent', userId: 'existing-user' });
    const agent = await connection.model(Agent.name).create({ name: 'Other Agent', userId: 'other-user' });
    await expect(
      service.updateAgent(agent.id, { name: ' Existing Agent ' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('turns a concurrent unique-index race into one stable conflict', async () => {
    const [first, second] = await connection.model(Agent.name).create([
      { name: 'First Agent', userId: 'race-first-user' },
      { name: 'Second Agent', userId: 'race-second-user' },
    ]);
    const results = await Promise.allSettled([
      service.updateAgent(first.id, { name: 'Contended Name' }),
      service.updateAgent(second.id, { name: 'Contended Name' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { status: 409, response: { code: 'AGENT_NAME_TAKEN' } },
    });
  });

  it('allows reusing the name of a deleted Agent', async () => {
    await connection.model(Agent.name).create({
      name: 'Reusable Name',
      userId: 'deleted-name-user',
      deletedAt: new Date(),
    });
    const active = await connection.model(Agent.name).create({
      name: 'Active Name',
      userId: 'active-name-user',
    });
    await expect(service.updateAgent(active.id, { name: 'Reusable Name' })).resolves.toMatchObject({
      name: 'Reusable Name',
    });
  });

  it('binds a one-time Guide link to the Agent Key and public-access versions', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'GuideAgent',
      userId: 'user-2',
    });
    await service.regenerateKey(agent.id);
    const result = await service.createGuideLink(agent.id, 6);
    const redisRecord = JSON.parse(redis.set.mock.calls[0]?.[1] as string) as {
      tokenHash: string;
      tokenCiphertext: string;
      expiresAt: string;
      keyVersion: number;
      publicAccessVersion: number;
      revisitIntervalHours: number;
    };
    expect(redisRecord).toMatchObject({
      tokenHash: expect.any(String),
      tokenCiphertext: expect.any(String),
      expiresAt: expect.any(String),
      keyVersion: 1,
      publicAccessVersion: 6,
      revisitIntervalHours: 6,
    });
    expect(result.url).toMatch(/^https:\/\/community\.example\.com\/guide\.md\?bootstrap=/u);
    expect(redis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      30 * 60,
    );
  });

  it('stores one current bootstrap record under the Agent identity', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'SingleBootstrapAgent',
      userId: 'single-bootstrap-user',
    });
    await service.regenerateKey(agent.id);

    await service.createGuideLink(agent.id, 6);

    expect(redis.set).toHaveBeenCalledWith(
      `agent-guide-bootstrap:${agent.id}`,
      expect.any(String),
      'EX',
      30 * 60,
    );
    const stored = JSON.parse(redis.set.mock.calls.at(-1)?.[1] as string) as {
      tokenHash?: string;
      tokenCiphertext?: string;
      expiresAt?: string;
    };
    expect(stored.tokenHash).toEqual(expect.any(String));
    expect(stored.tokenCiphertext).toEqual(expect.any(String));
    expect(stored.expiresAt).toEqual(expect.any(String));
  });

  it('returns the current usable bootstrap link when the connect window opens again', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'ActiveBootstrapAgent',
      userId: 'active-bootstrap-user',
    });
    await service.regenerateKey(agent.id);
    const created = await service.createGuideLink(agent.id, 6);
    redis.get.mockResolvedValue(redis.set.mock.calls.at(-1)?.[1]);

    await expect(service.getGuideLinkStatus(agent.id)).resolves.toEqual({
      active: true,
      url: created.url,
      expiresAt: created.expiresAt,
    });
  });

  it('clears a bootstrap that no longer matches the current Agent Key', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'RotatedBootstrapAgent',
      userId: 'rotated-bootstrap-user',
      secretKeyVersion: 2,
    });
    redis.get.mockResolvedValue(
      JSON.stringify({
        tokenHash: 'opaque-token-hash',
        tokenCiphertext: 'not-used-before-version-rejection',
        expiresAt: '2099-08-19T08:00:00.000Z',
        keyVersion: 1,
        publicAccessVersion: 6,
        revisitIntervalHours: 6,
      }),
    );

    await expect(service.getGuideLinkStatus(agent.id)).resolves.toEqual({
      active: false,
      url: null,
      expiresAt: null,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `agent-guide-bootstrap:${agent.id}`,
      expect.any(String),
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('clears a bootstrap whose usable link can no longer be recovered', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'UnreadableBootstrapAgent',
      userId: 'unreadable-bootstrap-user',
      secretKeyVersion: 1,
    });
    redis.get.mockResolvedValue(
      JSON.stringify({
        tokenHash: 'opaque-token-hash',
        tokenCiphertext: 'corrupted-ciphertext',
        expiresAt: '2099-08-19T08:00:00.000Z',
        keyVersion: 1,
        publicAccessVersion: 6,
        revisitIntervalHours: 6,
      }),
    );

    await expect(service.getGuideLinkStatus(agent.id)).resolves.toEqual({
      active: false,
      url: null,
      expiresAt: null,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `agent-guide-bootstrap:${agent.id}`,
      expect.any(String),
    );
  });

  it('stores the chosen revisit interval alongside the bootstrap token', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'IntervalAgent',
      userId: 'user-3',
    });
    await service.regenerateKey(agent.id);
    await service.createGuideLink(agent.id, 24);
    const redisRecord = JSON.parse(redis.set.mock.calls[0]?.[1] as string) as {
      revisitIntervalHours: number;
    };
    expect(redisRecord.revisitIntervalHours).toBe(24);
  });

  it('creates a missing Agent Key without returning it through the Guide link endpoint', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'BootstrapCreatesKeyAgent',
      userId: 'bootstrap-creates-key-user',
    });

    await expect(service.createGuideLink(agent.id, 6)).resolves.toMatchObject({
      url: expect.stringContaining('bootstrap='),
    });
    const updated = await connection
      .model(Agent.name)
      .findById(agent.id)
      .select('+secretKeyCiphertext');
    expect(updated).toMatchObject({ secretKeyVersion: 1 });
    expect(updated?.secretKeyCiphertext).toEqual(expect.any(String));
  });

  it('retries once when public access changes while creating a bootstrap', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'BootstrapConfigRaceAgent',
      userId: 'bootstrap-config-race-user',
    });
    await service.regenerateKey(agent.id);
    publicAccess.getPublicConfig
      .mockResolvedValueOnce({ guideUrl: 'https://v1.example/guide.md', version: 6 })
      .mockResolvedValueOnce({ guideUrl: 'https://v2.example/guide.md', version: 7 })
      .mockResolvedValueOnce({ guideUrl: 'https://v2.example/guide.md', version: 7 })
      .mockResolvedValueOnce({ guideUrl: 'https://v2.example/guide.md', version: 7 });

    await expect(service.createGuideLink(agent.id, 6)).resolves.toMatchObject({
      url: expect.stringMatching(/^https:\/\/v2\.example\/guide\.md\?bootstrap=/u),
    });
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });

  it('clears an unreadable bootstrap only if the same Redis value is still current', async () => {
    const raw = '{not-json';
    redis.get.mockResolvedValue(raw);

    await expect(service.getGuideLinkStatus('agent-1')).resolves.toEqual({
      active: false,
      url: null,
      expiresAt: null,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'agent-guide-bootstrap:agent-1',
      raw,
    );
  });
});
