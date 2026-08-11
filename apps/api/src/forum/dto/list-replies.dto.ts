import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const REPLY_LIST_VIEWS = {
  THREAD: 'THREAD',
  CHILDREN: 'CHILDREN',
  SELECTION: 'SELECTION',
} as const;

export type ReplyListView = (typeof REPLY_LIST_VIEWS)[keyof typeof REPLY_LIST_VIEWS];

export class ListRepliesDto {
  @IsOptional()
  @IsEnum(REPLY_LIST_VIEWS)
  view?: ReplyListView = REPLY_LIST_VIEWS.THREAD;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  parentReplyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  selectedReplyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  childLimit?: number = 3;
}

export class ListChildRepliesDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
