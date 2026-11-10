import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  STORY_DOCUMENT_KINDS,
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
  @ValidateIf((_dto: CreateStoryDocumentDto, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  expectedStructureVersion?: number;

  @IsOptional()
  @IsMongoId()
  parentDocumentId?: string | null;

  @IsOptional()
  @IsMongoId()
  afterDocumentId?: string | null;

  @IsEnum(STORY_DOCUMENT_KINDS)
  kind!: StoryDocumentKind;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(200)
  title!: string;

  @IsString()
  content!: string;

  @ValidateIf((_dto: CreateStoryDocumentDto, value: unknown) => value !== undefined)
  @IsArray()
  @IsObject({ each: true })
  @ArrayMaxSize(STORY_DOCUMENT_MAX_LINKS)
  @ArrayUnique((link: unknown) =>
    link instanceof StoryDocumentLinkDto ? `${link.targetDocumentId}:${link.relation}` : link,
  )
  @ValidateNested({ each: true })
  @Type(() => StoryDocumentLinkDto)
  links?: StoryDocumentLinkDto[];

  @IsString()
  @Matches(/\S/u)
  @MaxLength(280)
  changeSummary!: string;
}
