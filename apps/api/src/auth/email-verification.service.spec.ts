import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  EMAIL_VERIFICATION_PURPOSES,
  EmailVerification,
  EmailVerificationSchema,
} from '@/database/schemas/email-verification.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { RedisService } from '@/redis/redis.service';
import { MailQueueService } from '@/system/mail.service';
import { TurnstileService } from '@/system/turnstile.service';
import { AuthPolicyService } from '@/system/auth-policy.service';
import { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationService', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: EmailVerificationService;
  const redis = { multi: jest.fn() };
  const mailQueue = { enqueueVerification: jest.fn() };
  const turnstile = { verifyIfEnabled: jest.fn() };
  const authPolicy = { assertSmtpReady: jest.fn() };
  const previousHmacSecret = process.env.SECURITY_HMAC_SECRET;

  beforeAll(async () => {
    process.env.SECURITY_HMAC_SECRET = 'unit-test-security-hmac-0123456789-abcdef';
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: EmailVerification.name, schema: EmailVerificationSchema },
          { name: User.name, schema: UserSchema },
        ]),
      ],
      providers: [
        EmailVerificationService,
        { provide: RedisService, useValue: { getClient: () => redis } },
        { provide: MailQueueService, useValue: mailQueue },
        { provide: TurnstileService, useValue: turnstile },
        { provide: AuthPolicyService, useValue: authPolicy },
      ],
    }).compile();
    connection = moduleRef.get(getConnectionToken());
    service = moduleRef.get(EmailVerificationService);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await connection.db?.dropDatabase();
    redis.multi.mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 1],
        [null, 1],
      ]),
    });
    authPolicy.assertSmtpReady.mockResolvedValue(undefined);
    turnstile.verifyIfEnabled.mockResolvedValue(3);
    mailQueue.enqueueVerification.mockResolvedValue({ id: 'mail-job' });
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
    if (previousHmacSecret === undefined) delete process.env.SECURITY_HMAC_SECRET;
    else process.env.SECURITY_HMAC_SECRET = previousHmacSecret;
  });

  it('creates a single-use challenge and consumes it atomically', async () => {
    const sent = await service.send(
      ' Agent@Example.COM ',
      EMAIL_VERIFICATION_PURPOSES.REGISTER,
      undefined,
      '127.0.0.1',
    );
    const code = mailQueue.enqueueVerification.mock.calls[0]?.[0]?.code as string;
    const verified = await service.assertValid(
      sent.challengeId,
      'agent@example.com',
      code,
      EMAIL_VERIFICATION_PURPOSES.REGISTER,
    );
    const session = await connection.startSession();
    try {
      await session.withTransaction(() => service.consume(sent.challengeId, verified.digest, session));
      await expect(
        session.withTransaction(() => service.consume(sent.challengeId, verified.digest, session)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await session.endSession();
    }
  });

  it('locks the challenge after five wrong attempts', async () => {
    const sent = await service.send(
      'agent@example.com',
      EMAIL_VERIFICATION_PURPOSES.REGISTER,
      undefined,
    );
    const realCode = mailQueue.enqueueVerification.mock.calls[0]?.[0]?.code as string;
    const wrongCode = realCode === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.assertValid(
        sent.challengeId,
        'agent@example.com',
        wrongCode,
        EMAIL_VERIFICATION_PURPOSES.REGISTER,
      )).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(service.assertValid(
      sent.challengeId,
      'agent@example.com',
      realCode,
      EMAIL_VERIFICATION_PURPOSES.REGISTER,
    )).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not create a challenge when SMTP is unavailable', async () => {
    authPolicy.assertSmtpReady.mockRejectedValue(new BadRequestException('邮件服务尚未配置'));
    await expect(service.send(
      'agent@example.com',
      EMAIL_VERIFICATION_PURPOSES.REGISTER,
      undefined,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(turnstile.verifyIfEnabled).not.toHaveBeenCalled();
    expect(mailQueue.enqueueVerification).not.toHaveBeenCalled();
  });
});
