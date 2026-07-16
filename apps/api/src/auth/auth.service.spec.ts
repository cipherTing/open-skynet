import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Agent } from '@/database/schemas/agent.schema';
import { BrowserSession } from '@/database/schemas/browser-session.schema';
import { PlatformInitialization } from '@/database/schemas/platform-initialization.schema';
import { User } from '@/database/schemas/user.schema';
import { DatabaseService } from '@/database/database.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { AuthPolicyService } from '@/system/auth-policy.service';
import { EmailVerificationService } from './email-verification.service';
import { InvitationCodeService } from './invitation-code.service';
import { AuthService } from './auth.service';

describe('AuthService password reset', () => {
  let moduleRef: TestingModule;
  let service: AuthService;
  const userModel = { findOne: jest.fn() };
  const agentModel = {};
  const browserSessionModel = { updateMany: jest.fn() };
  const platformInitializationModel = {};
  const emailVerification = {
    normalizeEmail: jest.fn((value: string) => value.trim().toLowerCase()),
    assertValid: jest.fn(),
    consume: jest.fn(),
  };
  const databaseService = { $requiredTransaction: jest.fn() };
  const authPolicy = { acquireCurrentPolicy: jest.fn() };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Agent.name), useValue: agentModel },
        { provide: getModelToken(BrowserSession.name), useValue: browserSessionModel },
        {
          provide: getModelToken(PlatformInitialization.name),
          useValue: platformInitializationModel,
        },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: FeatureFlagService, useValue: {} },
        { provide: DatabaseService, useValue: databaseService },
        { provide: EmailVerificationService, useValue: emailVerification },
        { provide: InvitationCodeService, useValue: {} },
        { provide: AuthPolicyService, useValue: authPolicy },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('changes the password and revokes every browser session in one transaction', async () => {
    const session = { id: 'session' };
    const user = {
      id: 'user-1',
      passwordHash: 'old-hash',
      tokenVersion: 7,
      save: jest.fn().mockResolvedValue(undefined),
    };
    emailVerification.assertValid.mockResolvedValue({ digest: 'digest', policyVersion: 2 });
    authPolicy.acquireCurrentPolicy.mockResolvedValue({ turnstileEnabled: false, version: 2 });
    userModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(user) });
    browserSessionModel.updateMany.mockResolvedValue({ modifiedCount: 2 });
    emailVerification.consume.mockResolvedValue(undefined);
    databaseService.$requiredTransaction.mockImplementation(
      (callback: (transactionSession: typeof session) => Promise<void>) => callback(session),
    );

    await service.resetPassword({
      email: 'Agent@Example.com',
      verificationChallengeId: '507f1f77bcf86cd799439011',
      verificationCode: '123456',
      newPassword: 'newPassword123',
    });

    expect(user.tokenVersion).toBe(8);
    expect(user.passwordHash).not.toBe('old-hash');
    expect(user.save).toHaveBeenCalledWith({ session });
    expect(browserSessionModel.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
      { session },
    );
    expect(emailVerification.consume).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      'digest',
      session,
    );
  });
});
