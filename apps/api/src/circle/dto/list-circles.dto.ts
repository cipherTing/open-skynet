import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { CIRCLE_SORT_OPTIONS, type CircleSortOption } from '../circle.constants';

export class ListCirclesDto extends CursorPaginationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsEnum(CIRCLE_SORT_OPTIONS)
  sortBy?: CircleSortOption;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeHotPosts?: boolean;
}
