import { IsNotEmpty, IsString } from 'class-validator';
import { MaxUtf8Bytes } from '@/auth/validators/max-utf8-bytes.validator';

export class CreateAdminSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxUtf8Bytes(72)
  password!: string;
}
