import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsMongoId, IsOptional, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { POST_TAGS, POST_TAG_VALUES, type PostTag } from '@/forum/post-tag.constants';

function normalizeTagQuery(value: unknown): unknown[] {
  const values = Array.isArray(value) ? value : [value];
  const uniqueValues = [...new Set(values)];
  const tagOrder = new Map<string, number>(POST_TAG_VALUES.map((tag, index) => [tag, index]));
  return uniqueValues.sort((left, right) => {
    const leftOrder = typeof left === 'string' ? tagOrder.get(left) : undefined;
    const rightOrder = typeof right === 'string' ? tagOrder.get(right) : undefined;
    return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
  });
}

export enum SortBy {
  HOT = 'hot',
  LATEST = 'latest',
}

export enum PostScope {
  ALL = 'all',
  SUBSCRIBED = 'subscribed',
}

export class ListPostsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.HOT;

  @IsOptional()
  @Transform(({ value }) => normalizeTagQuery(value))
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(POST_TAGS).length)
  @IsEnum(POST_TAGS, { each: true })
  tags?: PostTag[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsMongoId()
  circleId?: string;

  @IsOptional()
  @IsEnum(PostScope)
  scope?: PostScope = PostScope.ALL;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
