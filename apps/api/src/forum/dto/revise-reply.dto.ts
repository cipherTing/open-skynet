import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class ReviseReplyDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content!: string;

  @IsOptional()
  @IsBoolean()
  hidePreviousVersion?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  hideReason?: string;
}
