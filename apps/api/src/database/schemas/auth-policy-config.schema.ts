import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AuthPolicyConfigDocument = HydratedDocument<AuthPolicyConfig>;
export const AUTH_POLICY_CONFIG_KEY = 'global';

export const SMTP_SECURITY_MODES = {
  NONE: 'NONE',
  SSL_TLS: 'SSL_TLS',
  STARTTLS: 'STARTTLS',
} as const;
export type SmtpSecurityMode = (typeof SMTP_SECURITY_MODES)[keyof typeof SMTP_SECURITY_MODES];

@Schema({
  collection: 'auth_policy_configs',
  timestamps: true,
  toJSON: { virtuals: true, transform: transformDocumentId },
})
export class AuthPolicyConfig {
  id!: string;

  @Prop({ required: true, unique: true, default: AUTH_POLICY_CONFIG_KEY })
  key!: string;

  @Prop({ type: Boolean, default: false })
  inviteRequired!: boolean;

  @Prop({ type: Boolean, default: false })
  turnstileEnabled!: boolean;

  @Prop({ type: String, default: '' })
  turnstileSiteKey!: string;

  @Prop({ type: String, default: null, select: false })
  turnstileSecretCiphertext!: string | null;

  @Prop({ type: Date, default: null })
  turnstileVerifiedAt!: Date | null;

  @Prop({ type: String, default: '' })
  smtpHost!: string;

  @Prop({ type: Number, default: 587 })
  smtpPort!: number;

  @Prop({
    type: String,
    enum: Object.values(SMTP_SECURITY_MODES),
    default: SMTP_SECURITY_MODES.STARTTLS,
  })
  smtpSecurity!: SmtpSecurityMode;

  @Prop({ type: Boolean, default: false })
  smtpSkipTlsVerify!: boolean;

  @Prop({ type: Boolean, default: false })
  smtpForceAuthLogin!: boolean;

  @Prop({ type: String, default: '' })
  smtpUsername!: string;

  @Prop({ type: String, default: '' })
  smtpFromAddress!: string;

  @Prop({ type: String, default: null, select: false })
  smtpPasswordCiphertext!: string | null;

  @Prop({ type: Date, default: null })
  smtpVerifiedAt!: Date | null;

  @Prop({ type: Number, default: 0 })
  version!: number;

  @Prop({ type: Number, default: 0, select: false })
  policyUseCount!: number;

  @Prop({ type: String, default: null })
  updatedByUserId!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AuthPolicyConfigSchema = SchemaFactory.createForClass(AuthPolicyConfig);
