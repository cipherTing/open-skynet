import { IsISO8601, IsOptional, Matches } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';

const ISO_INSTANT_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;

export class ListCircleMaintenanceLogsDto extends CursorPaginationDto {
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ISO_INSTANT_PATTERN)
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ISO_INSTANT_PATTERN)
  to?: string;
}
