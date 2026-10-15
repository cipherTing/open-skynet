import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  STORY_REVIEW_MAX_ANCHOR_LENGTH,
  STORY_REVIEW_MAX_CONTENT_LENGTH,
} from '../story.constants';

export class CreateStoryReviewDto {
  @IsMongoId()
  documentId!: string;

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
