import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CURSOR_PAGINATION_MAX_LIMIT,
  CursorPaginationDto,
} from '@/common/dto/cursor-pagination.dto';
import {
  STORY_DOCUMENT_KINDS,
  STORY_DOCUMENT_MAX_SELECTION,
  STORY_DOCUMENT_TITLE_QUERY_MAX_LENGTH,
  type StoryDocumentKind,
} from '../story.constants';

function normalizeDocumentIdsQuery(value: unknown): unknown {
  const values = Array.isArray(value) ? value : [value];
  if (!values.every((item): item is string => typeof item === 'string')) return value;
  return values.flatMap((item) => item.split(',').map((id) => id.trim()));
}

export class ListStoryDocumentsDto extends CursorPaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CURSOR_PAGINATION_MAX_LIMIT)
  override limit?: number;

  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsEnum(STORY_DOCUMENT_KINDS)
  kind?: StoryDocumentKind;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(STORY_DOCUMENT_TITLE_QUERY_MAX_LENGTH)
  @Matches(/\S/u)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeDocumentIdsQuery(value))
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(STORY_DOCUMENT_MAX_SELECTION)
  @IsMongoId({ each: true })
  documentIds?: string[];

  constructor() {
    super();
    this.limit = undefined;
  }
}
