import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ANNOUNCEMENT_KINDS,
  ANNOUNCEMENT_STATUSES,
  type AnnouncementKind,
  type AnnouncementStatus,
} from '@/database/schemas/announcement.schema';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';

export class ListAnnouncementsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ANNOUNCEMENT_STATUSES)
  status?: AnnouncementStatus;

  @IsOptional()
  @IsEnum(ANNOUNCEMENT_KINDS)
  kind?: AnnouncementKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
