import { IsInt, IsMongoId, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { STORY_DISCUSSION_MAX_CONTENT_LENGTH } from '../story.constants';

export class CreateStoryDiscussionDto {
  @IsMongoId()
  documentId!: string;

  @IsInt()
  @Min(1)
  revisionNumber!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  title!: string;

  @IsOptional()
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
  noticeTargetAgentId?: string | null;
}
