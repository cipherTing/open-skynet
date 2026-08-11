import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CIRCLE_PROPOSAL_STANCE_ACTIONS,
  CIRCLE_PROPOSAL_STANCES,
  CIRCLE_PROPOSAL_VOTES,
  CIRCLE_PROPOSAL_MARKDOWN_MAX_LENGTH,
} from '../circle.constants';

export const PROPOSAL_PARTICIPATION_OPERATIONS = {
  STANCE: 'STANCE',
  VOTE: 'VOTE',
} as const;

export type ProposalParticipationOperation =
  (typeof PROPOSAL_PARTICIPATION_OPERATIONS)[keyof typeof PROPOSAL_PARTICIPATION_OPERATIONS];

export class ProposalParticipationDto {
  @IsEnum(PROPOSAL_PARTICIPATION_OPERATIONS)
  operation!: ProposalParticipationOperation;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ValidateIf((dto: ProposalParticipationDto) => dto.operation === PROPOSAL_PARTICIPATION_OPERATIONS.STANCE)
  @IsEnum(CIRCLE_PROPOSAL_STANCE_ACTIONS)
  @IsOptional()
  stanceAction?: (typeof CIRCLE_PROPOSAL_STANCE_ACTIONS)[keyof typeof CIRCLE_PROPOSAL_STANCE_ACTIONS];

  @ValidateIf(
    (dto: ProposalParticipationDto) =>
      dto.operation === PROPOSAL_PARTICIPATION_OPERATIONS.STANCE &&
      dto.stanceAction === CIRCLE_PROPOSAL_STANCE_ACTIONS.SET,
  )
  @IsEnum(CIRCLE_PROPOSAL_STANCES)
  @IsOptional()
  stance?: (typeof CIRCLE_PROPOSAL_STANCES)[keyof typeof CIRCLE_PROPOSAL_STANCES];

  @ValidateIf(
    (dto: ProposalParticipationDto) =>
      dto.operation === PROPOSAL_PARTICIPATION_OPERATIONS.STANCE &&
      dto.stanceAction === CIRCLE_PROPOSAL_STANCE_ACTIONS.SET,
  )
  @IsString()
  @Matches(/\S/u)
  @MaxLength(CIRCLE_PROPOSAL_MARKDOWN_MAX_LENGTH)
  @IsOptional()
  reason?: string;

  @ValidateIf((dto: ProposalParticipationDto) => dto.operation === PROPOSAL_PARTICIPATION_OPERATIONS.VOTE)
  @IsEnum(CIRCLE_PROPOSAL_VOTES)
  @IsOptional()
  choice?: (typeof CIRCLE_PROPOSAL_VOTES)[keyof typeof CIRCLE_PROPOSAL_VOTES];
}
