import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { GoneException } from '@nestjs/common';
import { createHash } from 'node:crypto';
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

  beforeAll(async () => {
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

  async function initializeTestAdministrator(suffix: string) {
    return service.initializeAdministrator({
      username: `admin_${suffix}`,
      email: `admin-${suffix}@example.com`,
      password: 'Password123',
      agentName: `AdminAgent${suffix}`,
    });
  }

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  it('starts uninitialized and becomes initialized after creating the first administrator', async () => {
    await expect(service.getInitializationStatus()).resolves.toEqual({ initialized: false });

    const result = await service.initializeAdministrator({
      username: 'first_admin',
      email: 'first-admin@example.com',
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
        password: 'Password123',
        agentName: 'SecondAdminAgent',
      }),
    ).rejects.toMatchObject({
      status: 410,
      response: expect.objectContaining({ code: 'PLATFORM_INITIALIZATION_CLOSED' }),
    });
  });

  it('allows only one winner when two clients initialize concurrently', async () => {
    const attempts = await Promise.allSettled([
      service.initializeAdministrator({
        username: 'concurrent_admin_a',
        email: 'concurrent-a@example.com',
        password: 'Password123',
        agentName: 'ConcurrentAdminA',
      }),
      service.initializeAdministrator({
        username: 'concurrent_admin_b',
        email: 'concurrent-b@example.com',
        password: 'Password123',
        agentName: 'ConcurrentAdminB',
      }),
    ]);

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      attempts.some(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof GoneException &&
          (result.reason.getResponse() as { code?: string }).code ===
            'PLATFORM_INITIALIZATION_CLOSED',
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

  it('loads an active browser user with one bounded session aggregation', async () => {
    const result = await service.initializeAdministrator({
      username: 'session_admin',
      email: 'session-admin@example.com',
      password: 'Password123',
      agentName: 'SessionAdminAgent',
    });
    const browserSession = await connection.model(BrowserSession.name).findOne({
      userId: result.user.id,
    });
    expect(browserSession).not.toBeNull();

    await expect(
      service.findActiveBrowserUser(result.user.id, browserSession?.id),
    ).resolves.toMatchObject({
      id: result.user.id,
      username: 'session_admin',
      role: USER_ROLES.ADMIN,
    });

    await connection.model(BrowserSession.name).findByIdAndUpdate(browserSession?.id, {
      revokedAt: new Date(),
    });
    await expect(
      service.findActiveBrowserUser(result.user.id, browserSession?.id),
    ).resolves.toBeNull();
  });

  it('creates a v2 refresh token with selector state', async () => {
    const result = await initializeTestAdministrator('refresh_v2');
    const browserSession = await connection.model(BrowserSession.name).findOne({
      userId: result.user.id,
    });

    expect(result.refreshToken).toMatch(/^sk_rt_v2\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/u);
    expect(browserSession).toMatchObject({
      refreshTokenVersion: 2,
      rotationVersion: 0,
      selectorHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      previousTokenHash: null,
      previousTokenValidUntil: null,
    });
  });

  it('rotates one concurrent current token and accepts the loser through previous grace', async () => {
    const result = await initializeTestAdministrator('refresh_race');
    const originalRefreshToken = result.refreshToken;

    const refreshes = await Promise.all([
      service.refreshBrowserSession(originalRefreshToken),
      service.refreshBrowserSession(originalRefreshToken),
    ]);
    const rotatedTokens = refreshes.flatMap((refresh) =>
      refresh.refreshToken ? [refresh.refreshToken] : [],
    );

    expect(rotatedTokens).toHaveLength(1);
    expect(refreshes.filter((refresh) => refresh.refreshToken === null)).toHaveLength(1);
    await expect(service.refreshBrowserSession(rotatedTokens[0])).resolves.toMatchObject({
      refreshToken: expect.stringMatching(/^sk_rt_v2\./u),
    });
  });

  it('revokes the token family when an older generation is replayed', async () => {
    const result = await initializeTestAdministrator('refresh_replay');
    const originalRefreshToken = result.refreshToken;
    const firstRotation = await service.refreshBrowserSession(originalRefreshToken);
    const secondRotation = await service.refreshBrowserSession(firstRotation.refreshToken);
    expect(secondRotation.refreshToken).toMatch(/^sk_rt_v2\./u);

    await expect(service.refreshBrowserSession(originalRefreshToken)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFRESH_TOKEN_REUSED' }),
    });
    const browserSession = await connection.model(BrowserSession.name).findOne({
      userId: result.user.id,
    });
    expect(browserSession?.revokedAt).toBeInstanceOf(Date);
    await expect(
      service.findActiveBrowserUser(result.user.id, browserSession?.id),
    ).resolves.toBeNull();
  });

  it('revokes the token family when previous-token grace has expired', async () => {
    const result = await initializeTestAdministrator('refresh_previous_expired');
    const originalRefreshToken = result.refreshToken;
    await service.refreshBrowserSession(originalRefreshToken);
    await connection.model(BrowserSession.name).findOneAndUpdate(
      { userId: result.user.id },
      { $set: { previousTokenValidUntil: new Date(Date.now() - 1_000) } },
    );

    await expect(service.refreshBrowserSession(originalRefreshToken)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFRESH_TOKEN_REUSED' }),
    });
    await expect(
      connection.model(BrowserSession.name).findOne({ userId: result.user.id }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
  });

  it('does not modify sessions for a well-formed token with an unknown selector', async () => {
    const result = await initializeTestAdministrator('refresh_unknown_selector');
    const unknownFamilyToken = `sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}`;

    await expect(service.refreshBrowserSession(unknownFamilyToken)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_EXPIRED' }),
    });
    await expect(
      connection.model(BrowserSession.name).findOne({ userId: result.user.id }),
    ).resolves.toMatchObject({
      revokedAt: null,
      rotationVersion: 0,
    });
  });

  it('rejects refresh after logout revokes the browser session', async () => {
    const result = await initializeTestAdministrator('refresh_logout');
    const browserSession = await connection.model(BrowserSession.name).findOne({
      userId: result.user.id,
    });

    await service.logout(result.user.id, browserSession?.id);

    await expect(service.refreshBrowserSession(result.refreshToken)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_EXPIRED' }),
    });
    await expect(
      connection.model(BrowserSession.name).findById(browserSession?.id),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
  });

  it('rejects refresh after password reset revokes every browser session', async () => {
    const result = await initializeTestAdministrator('refresh_password_reset');

    await service.resetPassword({
      email: result.user.email,
      verificationChallengeId: '507f1f77bcf86cd799439011',
      verificationCode: '123456',
      newPassword: 'NewPassword456',
    });

    await expect(service.refreshBrowserSession(result.refreshToken)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_EXPIRED' }),
    });
    await expect(
      connection.model(BrowserSession.name).findOne({ userId: result.user.id }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
  });

  it('rejects refresh and revokes the browser session for a suspended account', async () => {
    const result = await initializeTestAdministrator('refresh_suspended');
    await connection.model(User.name).findByIdAndUpdate(result.user.id, {
      $set: { suspendedAt: new Date(), suspendedUntil: null },
    });

    await expect(service.refreshBrowserSession(result.refreshToken)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }),
    });
    await expect(
      connection.model(BrowserSession.name).findOne({ userId: result.user.id }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) });
  });

  it('rejects legacy browser sessions for both access and refresh authentication', async () => {
    const result = await initializeTestAdministrator('legacy_session');
    const legacyRefreshToken = 'legacy-refresh-token';
    const now = new Date();
    const legacySessionId = (
      await connection.model(BrowserSession.name).collection.insertOne({
        userId: result.user.id,
        currentTokenHash: createHash('sha256').update(legacyRefreshToken).digest('hex'),
        previousTokenHash: null,
        previousTokenValidUntil: null,
        expiresAt: new Date(now.getTime() + 60_000),
        absoluteExpiresAt: new Date(now.getTime() + 120_000),
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      })
    ).insertedId.toString();

    await expect(
      service.findActiveBrowserUser(result.user.id, legacySessionId),
    ).resolves.toBeNull();
    await expect(service.refreshBrowserSession(legacyRefreshToken)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_EXPIRED' }),
    });
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
});
