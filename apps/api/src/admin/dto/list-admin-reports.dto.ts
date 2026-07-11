import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';
import {
  REPORT_TARGET_STATUSES,
  REPORT_TARGET_TYPES,
  type ReportTargetStatus,
  type ReportTargetType,
} from '@/report/report.constants';

export class ListAdminReportsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(REPORT_TARGET_TYPES)
  targetType?: ReportTargetType;

  @IsOptional()
  @IsEnum(REPORT_TARGET_STATUSES)
  status?: ReportTargetStatus;
}
