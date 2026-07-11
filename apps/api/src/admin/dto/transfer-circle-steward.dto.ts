import { Transform, Type } from 'class-transformer';
import { IsInt, IsMongoId, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { CIRCLE_PUBLIC_REASON_MAX_LENGTH } from '@/circle/circle.constants';

export class TransferCircleStewardDto {
  @IsMongoId()
  agentId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  auditReason!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PUBLIC_REASON_MAX_LENGTH)
  publicReason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
