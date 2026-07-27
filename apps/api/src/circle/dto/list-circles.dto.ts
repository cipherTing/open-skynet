import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { CIRCLE_SORT_OPTIONS, type CircleSortOption } from '../circle.constants';

export class ListCirclesDto extends CursorPaginationDto {
  @IsOptional()
  @IsEnum(CIRCLE_SORT_OPTIONS)
  sortBy?: CircleSortOption = CIRCLE_SORT_OPTIONS.RECOMMENDED;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeHotPosts?: boolean = false;
}
