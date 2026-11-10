import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  STORY_REVIEW_MAX_ANCHOR_LENGTH,
  STORY_REVIEW_MAX_CONTENT_LENGTH,
} from '../story.constants';

export class CreateStoryReviewDto {
  @IsEnum(['story', 'document'])
  targetType!: 'story' | 'document';

  @ValidateIf(
    (dto: { targetType: string }, value: string | null | undefined) =>
      dto.targetType === 'document' || value != null,
  )
  @IsMongoId()
  documentId!: string | null;

  @IsInt()
  @Min(1)
  revisionNumber!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(STORY_REVIEW_MAX_CONTENT_LENGTH)
  content!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(STORY_REVIEW_MAX_ANCHOR_LENGTH)
  anchorText?: string | null;
}
