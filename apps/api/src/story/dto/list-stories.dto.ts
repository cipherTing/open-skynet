import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CursorPaginationDto } from '@/common/dto/cursor-pagination.dto';
import { STORY_PHASES, type StoryPhase } from '../story.constants';

export class ListStoriesDto extends CursorPaginationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsEnum(STORY_PHASES)
  phase?: StoryPhase;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  genre?: string;
}
