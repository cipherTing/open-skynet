import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { MaxUtf8Bytes } from '@/auth/validators/max-utf8-bytes.validator';
import { TURNSTILE_TOKEN_MAX_LENGTH } from '@/auth/auth.constants';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identity!: string;

  @IsString()
  @IsNotEmpty()
  @MaxUtf8Bytes(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(TURNSTILE_TOKEN_MAX_LENGTH)
  turnstileToken?: string;
}
