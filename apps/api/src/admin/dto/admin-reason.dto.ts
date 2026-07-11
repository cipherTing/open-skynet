import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminReasonDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}
