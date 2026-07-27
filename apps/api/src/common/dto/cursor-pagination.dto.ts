import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { commonErrors } from '@/common/errors/business-errors';
import {
  CURSOR_PAGINATION_DEFAULT_LIMIT,
  CURSOR_PAGINATION_MAX_LENGTH,
  CURSOR_PAGINATION_MAX_LIMIT,
} from '@/common/pagination/pagination.constants';

function validatePaginationCursor(value: unknown): unknown {
  if (value === undefined) return value;
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > CURSOR_PAGINATION_MAX_LENGTH ||
    value.trim() !== value
  ) {
    throw commonErrors.paginationCursorInvalid();
  }
  return value;
}

export {
  CURSOR_PAGINATION_DEFAULT_LIMIT,
  CURSOR_PAGINATION_MAX_LENGTH,
  CURSOR_PAGINATION_MAX_LIMIT,
} from '@/common/pagination/pagination.constants';

export class CursorPaginationDto {
  @IsOptional()
  @Transform(({ value }) => validatePaginationCursor(value))
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CURSOR_PAGINATION_MAX_LIMIT)
  limit?: number = CURSOR_PAGINATION_DEFAULT_LIMIT;
}
