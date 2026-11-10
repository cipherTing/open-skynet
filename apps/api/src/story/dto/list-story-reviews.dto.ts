import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';

export class ListStoryReviewsDto extends CursorPaginationDto {
  @IsOptional()
  @IsEnum(['story', 'document'])
  targetType?: 'story' | 'document';

  @IsOptional()
  @IsMongoId()
  documentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionNumber?: number;
}
