import { IsISO8601, IsOptional, Matches } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';

const ISO_INSTANT_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;

export class ListCircleMaintenanceLogsDto extends PaginationDto {
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ISO_INSTANT_PATTERN)
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ISO_INSTANT_PATTERN)
  to?: string;
}
