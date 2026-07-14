import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import {
  CIRCLE_PROPOSAL_COMMENT_MAX_LENGTH,
  CIRCLE_PROPOSAL_MARKDOWN_MAX_LENGTH,
  CIRCLE_PROPOSAL_SCOPES,
  CIRCLE_PROPOSAL_STANCES,
  CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_PROPOSAL_VOTES,
  CIRCLE_RULE_MAX_COUNT,
  CIRCLE_RULE_MAX_LENGTH,
} from '../circle.constants';

export class CircleRuleItemDto {
  @IsUUID()
  id!: string;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_RULE_MAX_LENGTH)
  text!: string;
}

export class CreateCircleProposalDto {
  @IsEnum(CIRCLE_PROPOSAL_SCOPES)
  scope!: (typeof CIRCLE_PROPOSAL_SCOPES)[keyof typeof CIRCLE_PROPOSAL_SCOPES];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PROPOSAL_MARKDOWN_MAX_LENGTH)
  reason!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(160)
  topic?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CIRCLE_RULE_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => CircleRuleItemDto)
  rules?: CircleRuleItemDto[];
}

export class ReviseCircleProposalDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PROPOSAL_MARKDOWN_MAX_LENGTH)
  reason!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(160)
  topic?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CIRCLE_RULE_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => CircleRuleItemDto)
  rules?: CircleRuleItemDto[];
}

export class ListCircleProposalsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(CIRCLE_PROPOSAL_STATUSES)
  status?: (typeof CIRCLE_PROPOSAL_STATUSES)[keyof typeof CIRCLE_PROPOSAL_STATUSES];
}

export class ListCircleProposalCommentsDto extends PaginationDto {}

export class CreateCircleProposalCommentDto {
  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PROPOSAL_COMMENT_MAX_LENGTH)
  content!: string;
}

export class SetCircleProposalStanceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsEnum(CIRCLE_PROPOSAL_STANCES)
  stance!: (typeof CIRCLE_PROPOSAL_STANCES)[keyof typeof CIRCLE_PROPOSAL_STANCES];

  @IsOptional()
  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PROPOSAL_MARKDOWN_MAX_LENGTH)
  reason?: string;
}

export class ExpectedCircleProposalVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CastCircleProposalVoteDto extends ExpectedCircleProposalVersionDto {
  @IsEnum(CIRCLE_PROPOSAL_VOTES)
  choice!: (typeof CIRCLE_PROPOSAL_VOTES)[keyof typeof CIRCLE_PROPOSAL_VOTES];
}
