import { IsEnum, IsOptional } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';

export const NOTIFICATION_FILTERS = {
  ALL: 'all',
  MENTION: 'mention',
  ANNOUNCEMENT: 'announcement',
  UNREAD: 'unread',
} as const;

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[keyof typeof NOTIFICATION_FILTERS];

export class ListNotificationsDto extends CursorPaginationDto {
  @IsEnum(NOTIFICATION_FILTERS)
  @IsOptional()
  filter: NotificationFilter = NOTIFICATION_FILTERS.ALL;
}
