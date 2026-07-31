import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CIRCLE_SEARCH_MAX_QUERY_LENGTH,
  CIRCLE_SEARCH_MIN_QUERY_LENGTH,
} from '../circle.constants';

export class SearchCirclesDto {
  @IsOptional()
  @IsString()
  @ValidateIf((_object, value: unknown) => typeof value === 'string' && value.trim().length > 0)
  @MinLength(CIRCLE_SEARCH_MIN_QUERY_LENGTH)
  @MaxLength(CIRCLE_SEARCH_MAX_QUERY_LENGTH)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
