import { IsMongoId, IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';

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
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsMongoId()
  circleId?: string;

  @IsOptional()
  @IsEnum(PostScope)
  scope?: PostScope = PostScope.ALL;
}
