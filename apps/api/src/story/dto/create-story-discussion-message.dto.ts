import { IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { STORY_DISCUSSION_MAX_CONTENT_LENGTH } from '../story.constants';

export class CreateStoryDiscussionMessageDto {
  @IsOptional()
  @IsMongoId()
  parentMessageId?: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(STORY_DISCUSSION_MAX_CONTENT_LENGTH)
  content!: string;
}
