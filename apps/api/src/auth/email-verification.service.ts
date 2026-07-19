import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import type { ClientSession, Model } from 'mongoose';
import {
  EmailVerification,
  type EmailVerificationPurpose,
} from '@/database/schemas/email-verification.schema';
import { User } from '@/database/schemas/user.schema';
import { hashOpaqueToken, secureTokenMatches } from './auth-security';
import { RedisService } from '@/redis/redis.service';
import { MailQueueService } from '@/system/mail.service';
import { TurnstileService } from '@/system/turnstile.service';
import { AuthPolicyService } from '@/system/auth-policy.service';
import { authErrors } from '@/common/errors/business-errors';
import { getApiLanguage } from '@/common/i18n/api-language';

const CODE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectModel(EmailVerification.name)
    private readonly verificationModel: Model<EmailVerification>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly redisService: RedisService,
    private readonly mailQueue: MailQueueService,
    private readonly turnstileService: TurnstileService,
    private readonly authPolicyService: AuthPolicyService,
  ) {}

  normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  async send(
    emailValue: string,
    purpose: EmailVerificationPurpose,
    turnstileToken: string | undefined,
    remoteIp?: string,
  ) {
    const email = this.normalizeEmail(emailValue);
    await this.authPolicyService.assertSmtpReady();
    const policyVersion = await this.turnstileService.verifyIfEnabled(
      turnstileToken,
      purpose === 'REGISTER' ? 'register-email' : 'reset-password-email',
      remoteIp,
    );
    await this.assertRateLimit(email, purpose, remoteIp ?? 'unknown');
    const existingUser = await this.userModel.findOne({ email });
    if (purpose === 'REGISTER' && existingUser) {
      throw authErrors.emailAlreadyRegistered();
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challenge = await new this.verificationModel({
      email,
      purpose,
      codeDigest: hashOpaqueToken(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      authPolicyVersion: policyVersion,
    }).save();
    await this.mailQueue.enqueueVerification({
      type: 'VERIFICATION_CODE',
      email,
      code,
      purpose,
      language: getApiLanguage(),
      deliver: purpose === 'REGISTER' || Boolean(existingUser),
    });
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString() };
  }

  async assertValid(
    challengeId: string,
    emailValue: string,
    code: string,
    purpose: EmailVerificationPurpose,
  ): Promise<{ digest: string; policyVersion: number }> {
    const challenge = await this.verificationModel.findById(challengeId).select('+codeDigest');
    const email = this.normalizeEmail(emailValue);
    if (
      !challenge ||
      challenge.email !== email ||
      challenge.purpose !== purpose ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.failedAttempts >= 5
    ) {
      throw authErrors.verificationInvalid();
    }
    if (!secureTokenMatches(code, challenge.codeDigest)) {
      await this.verificationModel.updateOne(
        { _id: challenge.id, consumedAt: null, failedAttempts: { $lt: 5 } },
        { $inc: { failedAttempts: 1 } },
      );
      throw authErrors.verificationIncorrect();
    }
    return { digest: challenge.codeDigest, policyVersion: challenge.authPolicyVersion };
  }

  async consume(challengeId: string, digest: string, session: ClientSession): Promise<void> {
    const result = await this.verificationModel.updateOne(
      {
        _id: challengeId,
        codeDigest: digest,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
        failedAttempts: { $lt: 5 },
      },
      { $set: { consumedAt: new Date() } },
      { session },
    );
    if (result.modifiedCount !== 1) throw authErrors.verificationAlreadyUsed();
  }

  private async assertRateLimit(email: string, purpose: string, ip: string): Promise<void> {
    const redis = this.redisService.getClient();
    const hour = Math.floor(Date.now() / 3_600_000);
    const emailKey = `auth:email:${purpose}:${hour}:${hashOpaqueToken(email)}`;
    const ipKey = `auth:email-ip:${purpose}:${hour}:${hashOpaqueToken(ip)}`;
    const pipeline = redis.multi();
    pipeline.incr(emailKey).expire(emailKey, 3700);
    pipeline.incr(ipKey).expire(ipKey, 3700);
    const results = await pipeline.exec();
    const emailCount = Number(results?.[0]?.[1] ?? 0);
    const ipCount = Number(results?.[2]?.[1] ?? 0);
    if (emailCount > 5 || ipCount > 20) {
      throw authErrors.verificationRateLimited();
    }
  }
}
