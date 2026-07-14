import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CIRCLE_KINDS, type CircleKind } from '@/circle/circle.constants';

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

  @IsIn(Object.values(CIRCLE_KINDS))
  kind: CircleKind = CIRCLE_KINDS.NORMAL;
}

export class AdminCircleTopicChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  value!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class AdminCircleRulesChangeDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AdminCircleRuleDto)
  value!: AdminCircleRuleDto[];

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class UpdateAdminCircleDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminCircleTopicChangeDto)
  topic?: AdminCircleTopicChangeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminCircleRulesChangeDto)
  rules?: AdminCircleRulesChangeDto;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}

export class AdminCircleReasonDto {
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  publicReason!: string;
}
