import { Injectable } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import nodemailer from 'nodemailer';
import { I18nService } from 'nestjs-i18n';
import {
  SMTP_SECURITY_MODES,
  type AuthPolicyConfigDocument,
} from '@/database/schemas/auth-policy-config.schema';
import { AuthPolicyService } from './auth-policy.service';
import { systemErrors } from '@/common/errors/business-errors';
import type { ApiLanguage } from '@/common/i18n/api-language';
import { getApiLanguage } from '@/common/i18n/api-language';

export const MAIL_QUEUE = 'mail';
export interface VerificationMailJob {
  type: 'VERIFICATION_CODE';
  email: string;
  code: string;
  purpose: 'REGISTER' | 'RESET_PASSWORD';
  language: ApiLanguage;
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
  constructor(
    private readonly authPolicyService: AuthPolicyService,
    private readonly i18n: I18nService,
  ) {}

  async sendVerification(job: VerificationMailJob): Promise<void> {
    if (!job.deliver) return;
    const config = await this.authPolicyService.getOrCreate();
    if (!config.smtpVerifiedAt) throw systemErrors.smtpUnverified();
    const subjectKey =
      job.purpose === 'REGISTER' ? 'api.mail.registerSubject' : 'api.mail.resetSubject';
    await this.sendWithConfig(
      config,
      job.email,
      this.i18n.t(subjectKey, { lang: job.language }),
      this.i18n.t('api.mail.verificationBody', {
        lang: job.language,
        args: { code: job.code },
      }),
    );
  }

  async sendTest(email: string): Promise<void> {
    const config = await this.authPolicyService.getOrCreate();
    const language = getApiLanguage();
    await this.sendWithConfig(
      config,
      email,
      this.i18n.t('api.mail.testSubject', { lang: language }),
      this.i18n.t('api.mail.testBody', { lang: language }),
    );
    await this.authPolicyService.markSmtpVerified(config.version);
  }

  private async sendWithConfig(
    config: AuthPolicyConfigDocument,
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    if (!config.smtpHost || !config.smtpFromAddress) {
      throw systemErrors.smtpIncomplete();
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
