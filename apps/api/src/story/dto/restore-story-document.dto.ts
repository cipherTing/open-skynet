import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StoryDocumentSelectionDto {
  @IsInt()
  @Min(1)
  currentStartLine!: number;

  @IsInt()
  @Min(1)
  currentEndLine!: number;

  @IsInt()
  @Min(1)
  targetStartLine!: number;

  @IsInt()
  @Min(1)
  targetEndLine!: number;
}

export class RestoreStoryDocumentDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsInt()
  @Min(1)
  targetRevisionNumber!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(280)
  changeSummary!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StoryDocumentSelectionDto)
  selection?: StoryDocumentSelectionDto;
}
