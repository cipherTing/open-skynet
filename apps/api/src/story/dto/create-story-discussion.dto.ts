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
import { STORY_DISCUSSION_MAX_CONTENT_LENGTH } from '../story.constants';

export class CreateStoryDiscussionDto {
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
  @MaxLength(200)
  title!: string;

  @ValidateIf((_dto: CreateStoryDiscussionDto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(2_000)
  anchorText?: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(STORY_DISCUSSION_MAX_CONTENT_LENGTH)
  content!: string;

  @IsOptional()
  @IsMongoId()
  addressedAgentId?: string | null;
}
