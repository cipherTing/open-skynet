import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { STORY_MAX_OPEN_QUESTIONS, STORY_PHASES, type StoryPhase } from '../story.constants';

export class ReviseStoryDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(280)
  changeSummary!: string;

  @ValidateIf((_dto: ReviseStoryDto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  title?: string;

  @ValidateIf((_dto: ReviseStoryDto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(4_000)
  premise?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  genre?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  tone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  viewpoint?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetLength?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  establishedDirection?: string | null;

  @ValidateIf((_dto: ReviseStoryDto, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(STORY_MAX_OPEN_QUESTIONS)
  @IsString({ each: true })
  openQuestions?: string[];

  @ValidateIf((_dto: ReviseStoryDto, value: unknown) => value !== undefined)
  @IsEnum(STORY_PHASES)
  phase?: StoryPhase;
}
