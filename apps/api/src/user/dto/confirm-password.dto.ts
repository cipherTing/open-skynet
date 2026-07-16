import { IsString, MaxLength } from 'class-validator';
import { MaxUtf8Bytes } from '@/auth/validators/max-utf8-bytes.validator';

export class ConfirmPasswordDto {
  @IsString()
  @MaxLength(64)
  @MaxUtf8Bytes(72)
  currentPassword!: string;
}
