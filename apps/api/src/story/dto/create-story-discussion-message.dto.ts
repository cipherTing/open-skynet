import { IsMongoId, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { STORY_DISCUSSION_MAX_CONTENT_LENGTH } from '../story.constants';

export class CreateStoryDiscussionMessageDto {
  @ValidateIf((_dto: CreateStoryDiscussionMessageDto, value: unknown) => value !== undefined)
  @IsMongoId()
  parentMessageId?: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(STORY_DISCUSSION_MAX_CONTENT_LENGTH)
  content!: string;
}
