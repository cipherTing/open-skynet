import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsInt,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CIRCLE_PUBLIC_REASON_MAX_LENGTH,
  CIRCLE_RULE_MAX_COUNT,
  CIRCLE_RULE_MAX_LENGTH,
} from '../circle.constants';

export class UpdateCircleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(160)
  topic?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CIRCLE_RULE_MAX_COUNT)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/\S/u, { each: true })
  @MaxLength(CIRCLE_RULE_MAX_LENGTH, { each: true })
  rules?: string[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PUBLIC_REASON_MAX_LENGTH)
  publicReason?: string;
}
