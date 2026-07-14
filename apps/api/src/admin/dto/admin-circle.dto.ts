import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdminCircleRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(280)
  text!: string;
}

export class CreateAdminCircleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  topic!: string;
}

export class UpdateAdminCircleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  topic?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AdminCircleRuleDto)
  rules?: AdminCircleRuleDto[];

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  publicReason!: string;
}

export class AdminCircleReasonDto {
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  publicReason!: string;
}
