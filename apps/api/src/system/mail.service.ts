import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import nodemailer from 'nodemailer';
import {
  SMTP_SECURITY_MODES,
  type AuthPolicyConfigDocument,
} from '@/database/schemas/auth-policy-config.schema';
import { AuthPolicyService } from './auth-policy.service';

export const MAIL_QUEUE = 'mail';
export interface VerificationMailJob {
  type: 'VERIFICATION_CODE';
  email: string;
  code: string;
  purpose: 'REGISTER' | 'RESET_PASSWORD';
  deliver: boolean;
}

@Injectable()
export class MailQueueService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<VerificationMailJob>) {}

  enqueueVerification(job: VerificationMailJob): Promise<Job<VerificationMailJob>> {
    return this.queue.add('verification-code', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }
}

@Injectable()
export class MailDeliveryService {
  constructor(private readonly authPolicyService: AuthPolicyService) {}

  async sendVerification(job: VerificationMailJob): Promise<void> {
    if (!job.deliver) return;
    const config = await this.authPolicyService.getOrCreate();
    if (!config.smtpVerifiedAt) throw new BadRequestException('SMTP 配置尚未通过测试');
    const subject = job.purpose === 'REGISTER' ? 'Skynet 注册验证码' : 'Skynet 密码重置验证码';
    await this.sendWithConfig(
      config,
      job.email,
      subject,
      `你的验证码是：${job.code}\n\n验证码 10 分钟内有效，请勿转发。`,
    );
  }

  async sendTest(email: string): Promise<void> {
    const config = await this.authPolicyService.getOrCreate();
    await this.sendWithConfig(config, email, 'Skynet SMTP 测试', '这是一封 SMTP 配置测试邮件。');
    await this.authPolicyService.markSmtpVerified(config.version);
  }

  private async sendWithConfig(
    config: AuthPolicyConfigDocument,
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    if (!config.smtpHost || !config.smtpFromAddress) {
      throw new BadRequestException('SMTP 尚未配置完整');
    }
    const password = this.authPolicyService.readSmtpPassword(config);
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecurity === SMTP_SECURITY_MODES.SSL_TLS,
      requireTLS: config.smtpSecurity === SMTP_SECURITY_MODES.STARTTLS,
      ignoreTLS: config.smtpSecurity === SMTP_SECURITY_MODES.NONE,
      auth: config.smtpUsername
        ? { user: config.smtpUsername, pass: password ?? '', type: 'login' }
        : undefined,
      authMethod: config.smtpForceAuthLogin ? 'LOGIN' : undefined,
      tls: { rejectUnauthorized: !config.smtpSkipTlsVerify },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    await transporter.sendMail({ from: config.smtpFromAddress, to, subject, text });
  }
}

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(private readonly deliveryService: MailDeliveryService) {
    super();
  }

  process(job: Job<VerificationMailJob>): Promise<void> {
    return this.deliveryService.sendVerification(job.data);
  }
}
