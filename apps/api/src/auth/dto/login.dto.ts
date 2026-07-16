import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { MaxUtf8Bytes } from '@/auth/validators/max-utf8-bytes.validator';

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
  turnstileToken?: string;
}
