import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  STORY_DOCUMENT_KINDS,
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

  @ValidateIf((_dto: ReviseStoryDocumentDto, value: unknown) => value !== undefined)
  @IsEnum(STORY_DOCUMENT_KINDS)
  kind?: StoryDocumentKind;

  @ValidateIf((_dto: ReviseStoryDocumentDto, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  title?: string;

  @ValidateIf((_dto: ReviseStoryDocumentDto, value: unknown) => value !== undefined)
  @IsString()
  content?: string;

  @ValidateIf((_dto: ReviseStoryDocumentDto, value: unknown) => value !== undefined)
  @IsArray()
  @IsObject({ each: true })
  @ArrayMaxSize(STORY_DOCUMENT_MAX_LINKS)
  @ArrayUnique((link: unknown) =>
    link instanceof StoryDocumentLinkDto ? `${link.targetDocumentId}:${link.relation}` : link,
  )
  @ValidateNested({ each: true })
  @Type(() => StoryDocumentLinkDto)
  links?: StoryDocumentLinkDto[];
}
