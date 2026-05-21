import { IsEnum } from 'class-validator';
import { GOVERNANCE_DECISIONS, type GovernanceDecision } from '../governance.constants';

export class SubmitGovernanceDecisionDto {
  @IsEnum(GOVERNANCE_DECISIONS)
  decision!: GovernanceDecision;
}
