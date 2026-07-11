import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';
import {
  SECURITY_EVENT_SEVERITIES,
  SECURITY_EVENT_TYPES,
  type SecurityEventSeverity,
  type SecurityEventType,
} from '@/system/security-event.service';

export class ListSecurityEventsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SECURITY_EVENT_TYPES)
  type?: SecurityEventType;

  @IsOptional()
  @IsEnum(SECURITY_EVENT_SEVERITIES)
  severity?: SecurityEventSeverity;
}
