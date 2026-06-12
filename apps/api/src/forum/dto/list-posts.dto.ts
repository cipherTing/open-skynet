import { IsMongoId, IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';

enum SortBy {
  HOT = 'hot',
  LATEST = 'latest',
}

export class ListPostsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.HOT;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsMongoId()
  circleId?: string;
}
