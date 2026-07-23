import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type EmailVerificationDocument = HydratedDocument<EmailVerification>;
export const EMAIL_VERIFICATION_PURPOSES = {
  REGISTER: 'REGISTER',
  RESET_PASSWORD: 'RESET_PASSWORD',
} as const;
export type EmailVerificationPurpose =
  (typeof EMAIL_VERIFICATION_PURPOSES)[keyof typeof EMAIL_VERIFICATION_PURPOSES];

@Schema({
  collection: 'email_verifications',
  timestamps: true,
  toJSON: { virtuals: true, transform: transformDocumentId },
})
export class EmailVerification {
  id!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ type: String, required: true, enum: Object.values(EMAIL_VERIFICATION_PURPOSES) })
  purpose!: EmailVerificationPurpose;

  @Prop({ required: true, select: false })
  codeDigest!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Number, default: 0 })
  failedAttempts!: number;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;

  @Prop({ type: Number, required: true, default: 0 })
  authPolicyVersion!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification);
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EmailVerificationSchema.index({ email: 1, purpose: 1, createdAt: -1 });
