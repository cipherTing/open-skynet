import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AuthService } from './auth.service';
import { DatabaseService } from '@/database/database.service';
import { User, UserSchema, USER_ROLES } from '@/database/schemas/user.schema';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { BrowserSession, BrowserSessionSchema } from '@/database/schemas/browser-session.schema';
import {
  PlatformInitialization,
  PlatformInitializationSchema,
} from '@/database/schemas/platform-initialization.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { EmailVerificationService } from './email-verification.service';
import { InvitationCodeService } from './invitation-code.service';
import { AuthPolicyService } from '@/system/auth-policy.service';

describe('AuthService administrator initialization', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: AuthService;
  const initializationKey = 'unit-test-initialization-key-0123456789-abcdef';
  const originalInitializationKey = process.env.INITIALIZATION_KEY;

  beforeAll(async () => {
    process.env.INITIALIZATION_KEY = initializationKey;
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri('skynet')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Agent.name, schema: AgentSchema },
          { name: BrowserSession.name, schema: BrowserSessionSchema },
          { name: PlatformInitialization.name, schema: PlatformInitializationSchema },
        ]),
      ],
      providers: [
        AuthService,
        DatabaseService,
        { provide: JwtService, useValue: { sign: jest.fn(() => 'test-access-token') } },
        {
          provide: FeatureFlagService,
          useValue: { assertEnabled: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EmailVerificationService,
          useValue: {
            normalizeEmail: (email: string) => email.trim().toLowerCase(),
            assertValid: jest.fn().mockResolvedValue({ digest: 'digest', policyVersion: 0 }),
            consume: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: InvitationCodeService, useValue: { consume: jest.fn() } },
        {
          provide: AuthPolicyService,
          useValue: {
            acquireCurrentPolicy: jest.fn().mockResolvedValue({
              turnstileEnabled: false,
              inviteRequired: false,
              version: 0,
            }),
          },
        },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(AuthService);
    await Promise.all(
      [User, Agent, BrowserSession, PlatformInitialization].map((model) =>
        connection.model(model.name).init(),
      ),
    );
  });

  beforeEach(async () => {
    await Promise.all([
      connection.model(PlatformInitialization.name).deleteMany({}),
      connection.model(BrowserSession.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
      connection.model(User.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
    if (originalInitializationKey === undefined) delete process.env.INITIALIZATION_KEY;
    else process.env.INITIALIZATION_KEY = originalInitializationKey;
  });

  it('starts uninitialized and becomes initialized after creating the first administrator', async () => {
    await expect(service.getInitializationStatus()).resolves.toEqual({ initialized: false });

    const result = await service.initializeAdministrator({
      username: 'first_admin',
      email: 'first-admin@example.com',
      initializationKey,
      password: 'Password123',
      agentName: 'FirstAdminAgent',
      agentDescription: '平台首位管理员',
    });

    expect(result.user).toEqual(
      expect.objectContaining({ username: 'first_admin', role: 'ADMIN' }),
    );
    await expect(service.getInitializationStatus()).resolves.toEqual({ initialized: true });
    await expect(
      service.initializeAdministrator({
        username: 'second_admin',
        email: 'second-admin@example.com',
        initializationKey,
        password: 'Password123',
        agentName: 'SecondAdminAgent',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows only one winner when two clients initialize concurrently', async () => {
    const attempts = await Promise.allSettled([
      service.initializeAdministrator({
        username: 'concurrent_admin_a',
        email: 'concurrent-a@example.com',
        initializationKey,
        password: 'Password123',
        agentName: 'ConcurrentAdminA',
      }),
      service.initializeAdministrator({
        username: 'concurrent_admin_b',
        email: 'concurrent-b@example.com',
        initializationKey,
        password: 'Password123',
        agentName: 'ConcurrentAdminB',
      }),
    ]);

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      attempts.some(
        (result) => result.status === 'rejected' && result.reason instanceof ConflictException,
      ),
    ).toBe(true);
    await expect(
      connection.model(User.name).countDocuments({ role: USER_ROLES.ADMIN }),
    ).resolves.toBe(1);
    await expect(connection.model(Agent.name).countDocuments({})).resolves.toBe(1);
    await expect(connection.model(BrowserSession.name).countDocuments({})).resolves.toBe(1);
    await expect(connection.model(PlatformInitialization.name).countDocuments({})).resolves.toBe(1);
  });

  it('rejects an administrator record that exists without an initialization marker', async () => {
    await connection.model(User.name).create({
      username: 'unmarked_admin',
      email: 'unmarked@example.com',
      emailVerifiedAt: new Date(),
      passwordHash: 'unmarked-password-hash',
      role: USER_ROLES.ADMIN,
    });

    await expect(service.getInitializationStatus()).resolves.toEqual({ initialized: false });
    await expect(
      service.initializeAdministrator({
        username: 'replacement_admin',
        email: 'replacement@example.com',
        initializationKey,
        password: 'Password123',
        agentName: 'ReplacementAdmin',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PLATFORM_INITIALIZATION_STATE_INVALID' }),
    });
    await expect(connection.model(PlatformInitialization.name).countDocuments({})).resolves.toBe(0);
    await expect(
      connection.model(User.name).countDocuments({ role: USER_ROLES.ADMIN }),
    ).resolves.toBe(1);
  });

  it('keeps initialization empty when the username or Agent name is occupied', async () => {
    const existingUser = await connection.model(User.name).create({
      username: 'occupied_username',
      email: 'occupied@example.com',
      emailVerifiedAt: new Date(),
      passwordHash: 'existing-password-hash',
      role: USER_ROLES.USER,
    });
    await connection.model(Agent.name).create({
      name: 'OccupiedAgent',
      description: '',
      userId: existingUser.id,
    });

    await expect(
      service.initializeAdministrator({
        username: 'occupied_username',
        email: 'different@example.com',
        initializationKey,
        password: 'Password123',
        agentName: 'NewAdminAgent',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'USERNAME_TAKEN' }),
    });
    await expect(
      service.initializeAdministrator({
        username: 'new_admin_username',
        email: 'new-admin@example.com',
        initializationKey,
        password: 'Password123',
        agentName: 'OccupiedAgent',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AGENT_NAME_TAKEN' }),
    });
    await expect(
      connection.model(User.name).countDocuments({ role: USER_ROLES.ADMIN }),
    ).resolves.toBe(0);
    await expect(connection.model(BrowserSession.name).countDocuments({})).resolves.toBe(0);
    await expect(connection.model(PlatformInitialization.name).countDocuments({})).resolves.toBe(0);
  });

  it('keeps ordinary registration as a USER account with an Agent and browser session', async () => {
    const result = await service.register({
      username: 'ordinary_user',
      email: 'ordinary@example.com',
      password: 'Password123',
      agentName: 'OrdinaryAgent',
      verificationChallengeId: '507f1f77bcf86cd799439011',
      verificationCode: '123456',
    });

    expect(result.user).toEqual(expect.objectContaining({ role: 'USER' }));
    await expect(
      connection.model(User.name).countDocuments({ role: USER_ROLES.USER }),
    ).resolves.toBe(1);
    await expect(connection.model(Agent.name).countDocuments({})).resolves.toBe(1);
    await expect(connection.model(BrowserSession.name).countDocuments({})).resolves.toBe(1);
    await expect(connection.model(PlatformInitialization.name).countDocuments({})).resolves.toBe(0);
  });

  it('allows initialization to reuse soft-deleted usernames and Agent names', async () => {
    const deletedUser = await connection.model(User.name).create({
      username: 'reusable_admin',
      email: 'deleted@example.com',
      emailVerifiedAt: new Date(),
      passwordHash: 'deleted-password-hash',
      role: USER_ROLES.USER,
      deletedAt: new Date(),
    });
    await connection.model(Agent.name).create({
      name: 'ReusableAgent',
      description: '',
      userId: deletedUser.id,
      deletedAt: new Date(),
    });

    const result = await service.initializeAdministrator({
      username: 'reusable_admin',
      email: 'reusable@example.com',
      initializationKey,
      password: 'Password123',
      agentName: 'ReusableAgent',
    });

    expect(result.user.role).toBe('ADMIN');
    await expect(
      connection.model(User.name).countDocuments({ username: 'reusable_admin' }),
    ).resolves.toBe(2);
    await expect(
      connection.model(Agent.name).countDocuments({ name: 'ReusableAgent' }),
    ).resolves.toBe(2);
  });

  it('rejects an invalid initialization key before writing any account data', async () => {
    await expect(
      service.initializeAdministrator({
        initializationKey: 'wrong',
        username: 'blocked_admin',
        email: 'blocked@example.com',
        password: 'Password123',
        agentName: 'BlockedAdmin',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(connection.model(User.name).countDocuments({})).resolves.toBe(0);
    await expect(connection.model(Agent.name).countDocuments({})).resolves.toBe(0);
    await expect(connection.model(BrowserSession.name).countDocuments({})).resolves.toBe(0);
    await expect(connection.model(PlatformInitialization.name).countDocuments({})).resolves.toBe(0);
  });
});
