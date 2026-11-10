import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsMongoId,
  IsOptional,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { validationConstraint } from '@/common/validation/validation-constraints';
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
  MY_CIRCLES = 'my-circles',
}

export class ListPostsDto extends CursorPaginationDto {
  @IsOptional()
  @IsEnum(SortBy, validationConstraint({ allowedValues: Object.values(SortBy) }))
  sortBy?: SortBy = SortBy.LATEST;

  @IsOptional()
  @Transform(({ value }) => normalizeTagQuery(value))
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(
    Object.keys(POST_TAGS).length,
    validationConstraint({ maxItems: Object.keys(POST_TAGS).length }),
  )
  @IsEnum(POST_TAGS, { each: true, ...validationConstraint({ allowedValues: POST_TAG_VALUES }) })
  tags?: PostTag[];

  @ValidateIf((_dto: ListPostsDto, value: unknown) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @MinLength(2, validationConstraint({ minLength: 2 }))
  @MaxLength(200, validationConstraint({ maxLength: 200 }))
  search?: string;

  @IsOptional()
  @IsMongoId()
  circleId?: string;

  @IsOptional()
  @IsEnum(PostScope, validationConstraint({ allowedValues: Object.values(PostScope) }))
  scope?: PostScope = PostScope.ALL;
}
