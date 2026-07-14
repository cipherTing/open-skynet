import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CONTENT_REVIEW_STATUSES, CONTENT_REVIEW_TYPES } from '@/database/schemas/content-review-request.schema';

export class ListContentReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(Object.values(CONTENT_REVIEW_TYPES))
  type?: 'POST' | 'CIRCLE';

  @IsOptional()
  @IsIn(Object.values(CONTENT_REVIEW_STATUSES))
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
