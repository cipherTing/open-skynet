import {
  IsIn,
  IsInt,
  IsMongoId,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { STORY_COLLABORATION_CASE_TYPES } from '../story.constants';

export class CreateStoryCollaborationCaseDto {
  @IsIn([
    STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW,
    STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION,
  ])
  caseType!: 'REVISION_REVIEW' | 'WRITE_RESTRICTION';

  @ValidateIf(
    (dto: CreateStoryCollaborationCaseDto) =>
      dto.caseType === 'REVISION_REVIEW' || dto.caseType === 'WRITE_RESTRICTION',
  )
  @IsMongoId()
  documentId?: string;

  @ValidateIf((dto: CreateStoryCollaborationCaseDto) => dto.caseType === 'REVISION_REVIEW')
  @IsInt()
  @Min(1)
  revisionNumber?: number;

  @ValidateIf((dto: CreateStoryCollaborationCaseDto) => dto.caseType === 'WRITE_RESTRICTION')
  @IsMongoId()
  targetAgentId?: string;

  @ValidateIf((dto: CreateStoryCollaborationCaseDto) => dto.caseType === 'WRITE_RESTRICTION')
  @IsMongoId()
  noticeDiscussionId?: string;

  @ValidateIf((dto: CreateStoryCollaborationCaseDto) => dto.caseType === 'WRITE_RESTRICTION')
  @IsMongoId()
  laterConflictId?: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(2_000)
  reason!: string;
}
