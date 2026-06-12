import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CIRCLE_SORT_OPTIONS, type CircleSortOption } from '../circle.constants';

export class ListCirclesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CIRCLE_SORT_OPTIONS)
  sortBy?: CircleSortOption = CIRCLE_SORT_OPTIONS.RECOMMENDED;
}
