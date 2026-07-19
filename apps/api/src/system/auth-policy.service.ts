import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, Model } from 'mongoose';
import {
  AUTH_POLICY_CONFIG_KEY,
  AuthPolicyConfig,
  type AuthPolicyConfigDocument,
  SMTP_SECURITY_MODES,
  type SmtpSecurityMode,
} from '@/database/schemas/auth-policy-config.schema';
import { decryptSecret, encryptSecret } from '@/common/security/encrypted-secret';
import { systemErrors } from '@/common/errors/business-errors';

export interface AuthPolicyUpdate {
  expectedVersion: number;
  inviteRequired: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecret?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurityMode;
  smtpSkipTlsVerify: boolean;
  smtpForceAuthLogin: boolean;
  smtpUsername: string;
  smtpFromAddress: string;
  smtpPassword?: string;
}

@Injectable()
export class AuthPolicyService {
  constructor(
    @InjectModel(AuthPolicyConfig.name)
    private readonly configModel: Model<AuthPolicyConfig>,
  ) {}

  async getOrCreate(session?: ClientSession): Promise<AuthPolicyConfigDocument> {
    const existing = await this.configModel
      .findOne({ key: AUTH_POLICY_CONFIG_KEY })
      .session(session ?? null)
      .select('+turnstileSecretCiphertext +smtpPasswordCiphertext');
    if (existing) return existing;
    try {
      return await new this.configModel({ key: AUTH_POLICY_CONFIG_KEY }).save({ session });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        const config = await this.configModel
          .findOne({ key: AUTH_POLICY_CONFIG_KEY })
          .session(session ?? null)
          .select('+turnstileSecretCiphertext +smtpPasswordCiphertext');
        if (config) return config;
      }
      throw error;
    }
  }

  async getPublicConfig() {
    const config = await this.getOrCreate();
    return {
      inviteRequired: config.inviteRequired,
      turnstileEnabled: config.turnstileEnabled,
      turnstileSiteKey: config.turnstileEnabled ? config.turnstileSiteKey : '',
      version: config.version,
    };
  }

  async getAdminConfig() {
    const config = await this.getOrCreate();
    return this.serializeAdmin(config);
  }

  async acquireCurrentPolicy(session: ClientSession): Promise<AuthPolicyConfigDocument> {
    const config = await this.getOrCreate(session);
    const acquired = await this.configModel
      .findOneAndUpdate(
        { _id: config.id, version: config.version },
        { $inc: { policyUseCount: 1 } },
        { new: true, session, timestamps: false },
      )
      .select('+turnstileSecretCiphertext +smtpPasswordCiphertext');
    if (!acquired) {
      throw systemErrors.authPolicyVerificationChanged();
    }
    return acquired;
  }

  async assertSmtpReady(): Promise<void> {
    const config = await this.getOrCreate();
    if (!config.smtpVerifiedAt || !config.smtpHost || !config.smtpFromAddress) {
      throw systemErrors.mailNotReady();
    }
  }

  async update(dto: AuthPolicyUpdate, updatedByUserId: string) {
    const config = await this.getOrCreate();
    if (config.version !== dto.expectedVersion) {
      throw systemErrors.authPolicyVersionConflict();
    }
    if (!Object.values(SMTP_SECURITY_MODES).includes(dto.smtpSecurity)) {
      throw systemErrors.smtpSecurityInvalid();
    }
    if (dto.turnstileEnabled && (!config.turnstileVerifiedAt || !dto.turnstileSiteKey.trim())) {
      throw systemErrors.turnstileVerificationRequired();
    }

    const turnstileChanged =
      config.turnstileSiteKey !== dto.turnstileSiteKey.trim() || Boolean(dto.turnstileSecret);
    const smtpChanged =
      config.smtpHost !== dto.smtpHost.trim() ||
      config.smtpPort !== dto.smtpPort ||
      config.smtpSecurity !== dto.smtpSecurity ||
      config.smtpSkipTlsVerify !== dto.smtpSkipTlsVerify ||
      config.smtpForceAuthLogin !== dto.smtpForceAuthLogin ||
      config.smtpUsername !== dto.smtpUsername.trim() ||
      config.smtpFromAddress !== dto.smtpFromAddress.trim() ||
      Boolean(dto.smtpPassword);

    const updated = await this.configModel
      .findOneAndUpdate(
        { _id: config.id, version: dto.expectedVersion },
        {
          $set: {
            inviteRequired: dto.inviteRequired,
            turnstileEnabled: turnstileChanged ? false : dto.turnstileEnabled,
            turnstileSiteKey: dto.turnstileSiteKey.trim(),
            turnstileVerifiedAt: turnstileChanged ? null : config.turnstileVerifiedAt,
            smtpHost: dto.smtpHost.trim(),
            smtpPort: dto.smtpPort,
            smtpSecurity: dto.smtpSecurity,
            smtpSkipTlsVerify: dto.smtpSkipTlsVerify,
            smtpForceAuthLogin: dto.smtpForceAuthLogin,
            smtpUsername: dto.smtpUsername.trim(),
            smtpFromAddress: dto.smtpFromAddress.trim().toLowerCase(),
            smtpVerifiedAt: smtpChanged ? null : config.smtpVerifiedAt,
            version: dto.expectedVersion + 1,
            updatedByUserId,
            ...(dto.turnstileSecret
              ? {
                  turnstileSecretCiphertext: encryptSecret(
                    dto.turnstileSecret,
                    'turnstile-secret',
                    AUTH_POLICY_CONFIG_KEY,
                  ),
                }
              : {}),
            ...(dto.smtpPassword
              ? {
                  smtpPasswordCiphertext: encryptSecret(
                    dto.smtpPassword,
                    'smtp-password',
                    AUTH_POLICY_CONFIG_KEY,
                  ),
                }
              : {}),
          },
        },
        { new: true },
      )
      .select('+turnstileSecretCiphertext +smtpPasswordCiphertext');
    if (!updated) {
      throw systemErrors.authPolicyVersionConflict();
    }
    return this.serializeAdmin(updated);
  }

  async markTurnstileVerified(expectedVersion: number): Promise<void> {
    const result = await this.configModel.updateOne(
      { key: AUTH_POLICY_CONFIG_KEY, version: expectedVersion },
      { $set: { turnstileVerifiedAt: new Date() } },
    );
    if (result.modifiedCount !== 1) {
      throw systemErrors.turnstileConfigConflict();
    }
  }

  async markSmtpVerified(expectedVersion: number): Promise<void> {
    const result = await this.configModel.updateOne(
      { key: AUTH_POLICY_CONFIG_KEY, version: expectedVersion },
      { $set: { smtpVerifiedAt: new Date() } },
    );
    if (result.modifiedCount !== 1) {
      throw systemErrors.smtpConfigConflict();
    }
  }

  readTurnstileSecret(config: AuthPolicyConfig): string | null {
    return config.turnstileSecretCiphertext
      ? decryptSecret(config.turnstileSecretCiphertext, 'turnstile-secret', AUTH_POLICY_CONFIG_KEY)
      : null;
  }

  readSmtpPassword(config: AuthPolicyConfig): string | null {
    return config.smtpPasswordCiphertext
      ? decryptSecret(config.smtpPasswordCiphertext, 'smtp-password', AUTH_POLICY_CONFIG_KEY)
      : null;
  }

  private serializeAdmin(config: AuthPolicyConfig) {
    return {
      inviteRequired: config.inviteRequired,
      turnstileEnabled: config.turnstileEnabled,
      turnstileSiteKey: config.turnstileSiteKey,
      turnstileSecretConfigured: Boolean(config.turnstileSecretCiphertext),
      turnstileVerifiedAt: config.turnstileVerifiedAt?.toISOString() ?? null,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecurity: config.smtpSecurity,
      smtpSkipTlsVerify: config.smtpSkipTlsVerify,
      smtpForceAuthLogin: config.smtpForceAuthLogin,
      smtpUsername: config.smtpUsername,
      smtpFromAddress: config.smtpFromAddress,
      smtpPasswordConfigured: Boolean(config.smtpPasswordCiphertext),
      smtpVerifiedAt: config.smtpVerifiedAt?.toISOString() ?? null,
      version: config.version,
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}
