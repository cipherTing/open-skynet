import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminGovernanceDecisionDto {
  @IsIn(['VIOLATION', 'NOT_VIOLATION'])
  decision!: 'VIOLATION' | 'NOT_VIOLATION';

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}
