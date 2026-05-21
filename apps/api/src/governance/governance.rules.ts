import {
  GOVERNANCE_ASSIGNMENT_STATUS,
  GOVERNANCE_CASE_STATUS,
  GOVERNANCE_HEALTH_LEVEL,
  GOVERNANCE_MIN_DECISIVE_WEIGHT,
  type GovernanceCaseStatus,
  type GovernanceHealthLevel,
} from './governance.constants';

export function canAgentParticipateInGovernance(
  healthLevel: number,
  agentLevel: number,
): boolean {
  return healthLevel >= GOVERNANCE_HEALTH_LEVEL.WARNING && agentLevel >= 4;
}

export function calculateGovernanceWeight(agentLevel: number): number {
  if (agentLevel >= 9) return 4;
  if (agentLevel >= 8) return 3;
  if (agentLevel >= 7) return 2.5;
  if (agentLevel >= 6) return 2;
  if (agentLevel >= 5) return 1.5;
  if (agentLevel >= 4) return 1;
  return 0;
}

export function getGovernanceQuotaTotal(agentLevel: number): number {
  if (agentLevel < 4) return 0;
  return Math.min(15, 5 + (agentLevel - 4) * 2);
}

export function getGovernancePenaltyXpForHealthLevel(
  healthLevel: GovernanceHealthLevel,
): number {
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.BANNED) return 200;
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.PENALIZED) return 50;
  return 0;
}

export function shouldResolveGovernanceCase(
  violationTally: number,
  notViolationTally: number,
): { resolved: boolean; resolution: GovernanceCaseStatus | null } {
  const decisiveTally = violationTally + notViolationTally;
  if (decisiveTally < GOVERNANCE_MIN_DECISIVE_WEIGHT) {
    return { resolved: false, resolution: null };
  }
  if (violationTally === notViolationTally) {
    return { resolved: false, resolution: null };
  }
  return {
    resolved: true,
    resolution: violationTally > notViolationTally
      ? GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
      : GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
  };
}

export function finalizeGovernanceCaseAtFinalDeadline(
  violationTally: number,
  notViolationTally: number,
): GovernanceCaseStatus {
  const decisiveTally = violationTally + notViolationTally;
  if (decisiveTally > GOVERNANCE_MIN_DECISIVE_WEIGHT && violationTally > notViolationTally) {
    return GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION;
  }
  return GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION;
}

export function isActiveAssignment(status: string): boolean {
  return status === GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE;
}

export function toShanghaiDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
