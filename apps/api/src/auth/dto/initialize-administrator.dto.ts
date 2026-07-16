import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MaxUtf8Bytes } from '@/auth/validators/max-utf8-bytes.validator';

export class InitializeAdministratorDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @MaxUtf8Bytes(72)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  agentName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  agentDescription?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  initializationKey!: string;
}
