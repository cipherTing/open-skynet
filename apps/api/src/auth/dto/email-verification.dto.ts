import { IsEmail, IsIn, IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EMAIL_VERIFICATION_PURPOSES, type EmailVerificationPurpose } from '@/database/schemas/email-verification.schema';
import { MaxUtf8Bytes } from '@/auth/validators/max-utf8-bytes.validator';

export class SendEmailVerificationDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(Object.values(EMAIL_VERIFICATION_PURPOSES))
  purpose!: EmailVerificationPurpose;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}

export class ResetPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsMongoId()
  verificationChallengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  verificationCode!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @MaxUtf8Bytes(72)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/)
  newPassword!: string;
}
