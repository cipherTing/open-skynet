import { Transform, Type } from 'class-transformer';
import { IsInt, IsMongoId, IsString, Matches, MaxLength, Min } from 'class-validator';
import { CIRCLE_PUBLIC_REASON_MAX_LENGTH } from '../circle.constants';

export class TransferCircleStewardshipDto {
  @IsMongoId()
  agentId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PUBLIC_REASON_MAX_LENGTH)
  publicReason!: string;
}
