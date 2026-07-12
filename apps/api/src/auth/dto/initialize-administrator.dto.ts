import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { RegisterDto } from './register.dto';

export class InitializeAdministratorDto extends RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  initializationKey!: string;
}
