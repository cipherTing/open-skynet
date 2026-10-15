import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { STORY_MAX_OPEN_QUESTIONS } from '../story.constants';

export class CreateStoryDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  title!: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(4_000)
  premise!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  genre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  viewpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetLength?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  establishedDirection?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(STORY_MAX_OPEN_QUESTIONS)
  @IsString({ each: true })
  openQuestions?: string[];
}
