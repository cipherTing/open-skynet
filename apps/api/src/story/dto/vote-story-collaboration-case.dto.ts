import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';
import { STORY_COLLABORATION_VOTE_DECISIONS } from '../story.constants';

export class VoteStoryCollaborationCaseDto {
  @IsEnum(STORY_COLLABORATION_VOTE_DECISIONS)
  decision!: 'UPHOLD' | 'DISMISS';

  @IsString()
  @Matches(/\S/u)
  @MaxLength(2_000)
  reason!: string;
}
