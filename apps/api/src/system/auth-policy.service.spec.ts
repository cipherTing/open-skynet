import { ConflictException } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  AuthPolicyConfig,
  AuthPolicyConfigSchema,
  SMTP_SECURITY_MODES,
} from '@/database/schemas/auth-policy-config.schema';
import { AuthPolicyService, type AuthPolicyUpdate } from './auth-policy.service';

describe('AuthPolicyService', () => {
  jest.setTimeout(120_000);
  let mongo: MongoMemoryServer;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: AuthPolicyService;
  const previousEncryptionKey = process.env.APP_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = 'unit-test-app-encryption-key-0123456789-abcdef';
    mongo = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([
          { name: AuthPolicyConfig.name, schema: AuthPolicyConfigSchema },
        ]),
      ],
      providers: [AuthPolicyService],
    }).compile();
    connection = moduleRef.get(getConnectionToken());
    service = moduleRef.get(AuthPolicyService);
    await connection.model(AuthPolicyConfig.name).init();
  });

  beforeEach(async () => {
    await connection.db?.dropDatabase();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
    if (previousEncryptionKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
    else process.env.APP_ENCRYPTION_KEY = previousEncryptionKey;
  });

  function update(overrides: Partial<AuthPolicyUpdate> = {}): AuthPolicyUpdate {
    return {
      expectedVersion: 0,
      inviteRequired: false,
      turnstileEnabled: false,
      turnstileSiteKey: '',
      smtpHost: 'smtp.example.test',
      smtpPort: 587,
      smtpSecurity: SMTP_SECURITY_MODES.STARTTLS,
      smtpSkipTlsVerify: false,
      smtpForceAuthLogin: false,
      smtpUsername: '',
      smtpFromAddress: 'noreply@localhost.test',
      ...overrides,
    };
  }

  it('allows only one concurrent update for the same expected version', async () => {
    await service.getOrCreate();

    const results = await Promise.allSettled([
      service.update(update({ inviteRequired: true }), 'admin-a'),
      service.update(update({ smtpPort: 2525 }), 'admin-b'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(service.getAdminConfig()).resolves.toMatchObject({ version: 1 });
  });

  it('refuses to attach a test result to a newer configuration', async () => {
    await service.getOrCreate();
    await service.update(update(), 'admin-a');

    await expect(service.markSmtpVerified(0)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.markTurnstileVerified(0)).rejects.toBeInstanceOf(ConflictException);
  });

  it('acquires the policy through a write without advancing its public version', async () => {
    await service.getOrCreate();
    const session = await connection.startSession();
    try {
      await expect(service.acquireCurrentPolicy(session)).resolves.toMatchObject({ version: 0 });
    } finally {
      await session.endSession();
    }
    const stored = await connection
      .model(AuthPolicyConfig.name)
      .findOne({ key: 'global' })
      .select('+policyUseCount');
    expect(stored?.policyUseCount).toBe(1);
    expect(stored?.version).toBe(0);
  });
});
