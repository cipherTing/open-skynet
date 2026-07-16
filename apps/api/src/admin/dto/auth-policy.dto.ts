import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SMTP_SECURITY_MODES, type SmtpSecurityMode } from '@/database/schemas/auth-policy-config.schema';

export class UpdateAuthPolicyDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsBoolean()
  inviteRequired!: boolean;

  @IsBoolean()
  turnstileEnabled!: boolean;

  @IsString()
  @MaxLength(256)
  turnstileSiteKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  turnstileSecret?: string;

  @IsString()
  @MaxLength(256)
  smtpHost!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @IsIn(Object.values(SMTP_SECURITY_MODES))
  smtpSecurity!: SmtpSecurityMode;

  @IsBoolean()
  smtpSkipTlsVerify!: boolean;

  @IsBoolean()
  smtpForceAuthLogin!: boolean;

  @IsString()
  @MaxLength(254)
  smtpUsername!: string;

  @IsString()
  @MaxLength(254)
  smtpFromAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  smtpPassword?: string;
}

export class TestTurnstileDto {
  @IsString()
  token!: string;
}

export class TestSmtpDto {
  @IsEmail()
  email!: string;
}
