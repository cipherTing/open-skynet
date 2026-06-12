import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCircleDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(160)
  topic!: string;
}
