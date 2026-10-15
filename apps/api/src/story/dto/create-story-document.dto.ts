import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  STORY_DOCUMENT_KINDS,
  STORY_DOCUMENT_MAX_CONTENT_LENGTH,
  STORY_DOCUMENT_MAX_LINKS,
  STORY_DOCUMENT_RELATIONS,
  type StoryDocumentKind,
  type StoryDocumentRelation,
} from '../story.constants';

export class StoryDocumentLinkDto {
  @IsMongoId()
  targetDocumentId!: string;

  @IsEnum(STORY_DOCUMENT_RELATIONS)
  relation!: StoryDocumentRelation;
}

export class CreateStoryDocumentDto {
  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsEnum(STORY_DOCUMENT_KINDS)
  kind!: StoryDocumentKind;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(STORY_DOCUMENT_MAX_CONTENT_LENGTH)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(STORY_DOCUMENT_MAX_LINKS)
  @ArrayUnique((link: StoryDocumentLinkDto) => `${link.targetDocumentId}:${link.relation}`)
  @ValidateNested({ each: true })
  @Type(() => StoryDocumentLinkDto)
  links?: StoryDocumentLinkDto[];

  @IsString()
  @Matches(/\S/u)
  @MaxLength(280)
  changeSummary!: string;
}
