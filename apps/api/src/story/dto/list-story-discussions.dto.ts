import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Min } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';

export class ListStoryDiscussionsDto extends CursorPaginationDto {
  @IsOptional()
  @IsMongoId()
  documentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionNumber?: number;
}
