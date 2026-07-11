import {
  GOVERNANCE_ABANDON_AFTER_HOURS,
  GOVERNANCE_ASSIGNMENT_STATUS,
  GOVERNANCE_CASE_STATUS,
  GOVERNANCE_DECISIONS,
  GOVERNANCE_EMERGENCY_AFTER_HOURS,
  GOVERNANCE_HEALTH_LEVEL,
  GOVERNANCE_MIN_DECISIVE_WEIGHT,
} from './governance.constants';
import {
  calculateGovernanceWeight,
  canAgentParticipateInGovernance,
  getGovernanceQuotaTotal,
  finalizeGovernanceCaseAtFinalDeadline,
  shouldResolveGovernanceCase,
} from './governance.rules';

describe('governance rules', () => {
  it('uses health only as eligibility gate, not as weight', () => {
    expect(canAgentParticipateInGovernance(GOVERNANCE_HEALTH_LEVEL.GOOD, 4)).toBe(true);
    expect(canAgentParticipateInGovernance(GOVERNANCE_HEALTH_LEVEL.WARNING, 4)).toBe(true);
    expect(canAgentParticipateInGovernance(GOVERNANCE_HEALTH_LEVEL.PENALIZED, 9)).toBe(false);
    expect(canAgentParticipateInGovernance(GOVERNANCE_HEALTH_LEVEL.BANNED, 9)).toBe(false);

    expect(calculateGovernanceWeight(4)).toBe(calculateGovernanceWeight(4));
  });

  it('calculates governance weight from normal agent level', () => {
    expect(calculateGovernanceWeight(1)).toBe(0);
    expect(calculateGovernanceWeight(2)).toBe(0);
    expect(calculateGovernanceWeight(3)).toBe(0);
    expect(calculateGovernanceWeight(4)).toBe(1);
    expect(calculateGovernanceWeight(5)).toBe(1.5);
    expect(calculateGovernanceWeight(6)).toBe(2);
    expect(calculateGovernanceWeight(7)).toBe(2.5);
    expect(calculateGovernanceWeight(8)).toBe(3);
    expect(calculateGovernanceWeight(9)).toBe(4);
  });

  it('uses agreed thresholds and deadlines', () => {
    expect(GOVERNANCE_EMERGENCY_AFTER_HOURS).toBe(48);
    expect(GOVERNANCE_ABANDON_AFTER_HOURS).toBe(56);
    expect(GOVERNANCE_MIN_DECISIVE_WEIGHT).toBe(5);
  });

  it('calculates daily quota independently from progression stamina', () => {
    expect(getGovernanceQuotaTotal(1)).toBe(0);
    expect(getGovernanceQuotaTotal(3)).toBe(0);
    expect(getGovernanceQuotaTotal(4)).toBe(5);
    expect(getGovernanceQuotaTotal(5)).toBe(7);
    expect(getGovernanceQuotaTotal(9)).toBe(15);
  });

  it('resolves at scheduled review only when decisive weight reaches threshold and is not tied', () => {
    expect(shouldResolveGovernanceCase(5, 0)).toEqual({ resolved: true, resolution: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION });
    expect(shouldResolveGovernanceCase(1, 5)).toEqual({ resolved: true, resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION });
    expect(shouldResolveGovernanceCase(2.5, 2.5)).toEqual({ resolved: false, resolution: null });
    expect(shouldResolveGovernanceCase(4, 0)).toEqual({ resolved: false, resolution: null });
  });

  it('finalizes at 56h as violation only above threshold and with violation majority', () => {
    expect(finalizeGovernanceCaseAtFinalDeadline(6, 0)).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION);
    expect(finalizeGovernanceCaseAtFinalDeadline(5, 0)).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION);
    expect(finalizeGovernanceCaseAtFinalDeadline(3, 3)).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION);
    expect(finalizeGovernanceCaseAtFinalDeadline(1, 5)).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION);
  });

  it('keeps assignment status separate from case status without abstain states', () => {
    expect(Object.values(GOVERNANCE_DECISIONS)).toEqual(['VIOLATION', 'NOT_VIOLATION']);
    expect(GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE).toBe('ACTIVE');
    expect(GOVERNANCE_ASSIGNMENT_STATUS.SUBMITTED).toBe('SUBMITTED');
    expect(GOVERNANCE_CASE_STATUS.OPEN).toBe('OPEN');
  });
});
