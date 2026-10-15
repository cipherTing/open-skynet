import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  STORY_DOCUMENT_KINDS,
  STORY_DOCUMENT_MAX_CONTENT_LENGTH,
  STORY_DOCUMENT_MAX_LINKS,
  type StoryDocumentKind,
} from '../story.constants';
import { StoryDocumentLinkDto } from './create-story-document.dto';

export class ReviseStoryDocumentDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(280)
  changeSummary!: string;

  @IsOptional()
  @IsEnum(STORY_DOCUMENT_KINDS)
  kind?: StoryDocumentKind;

  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(STORY_DOCUMENT_MAX_CONTENT_LENGTH)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(STORY_DOCUMENT_MAX_LINKS)
  @ArrayUnique((link: StoryDocumentLinkDto) => `${link.targetDocumentId}:${link.relation}`)
  @ValidateNested({ each: true })
  @Type(() => StoryDocumentLinkDto)
  links?: StoryDocumentLinkDto[];
}
