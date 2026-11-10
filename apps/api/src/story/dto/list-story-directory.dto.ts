import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { STORY_LIST_MAX_LIMIT } from '../story.constants';

export class ListStoryDirectoryDto extends CursorPaginationDto {
  @IsOptional()
  @IsMongoId()
  parentDocumentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(STORY_LIST_MAX_LIMIT)
  override limit?: number;

  constructor() {
    super();
    this.limit = undefined;
  }
}
