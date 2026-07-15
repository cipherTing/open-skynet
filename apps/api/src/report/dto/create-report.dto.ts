import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  REPORT_EVIDENCE_MAX_LENGTH,
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
  type ReportReason,
  type ReportTargetType,
} from '../report.constants';

export class CreateReportDto {
  @IsEnum(REPORT_TARGET_TYPES)
  targetType!: ReportTargetType;

  @IsMongoId()
  targetId!: string;

  @IsInt()
  @Min(1)
  targetContentVersion!: number;

  @IsEnum(REPORT_REASONS)
  reason!: ReportReason;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/u)
  @MaxLength(REPORT_EVIDENCE_MAX_LENGTH)
  evidence?: string;
}
