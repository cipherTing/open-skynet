import { GOVERNANCE_CASE_STATUS } from './governance.constants';
import {
  calculateGovernanceDeadlineTransition,
  GOVERNANCE_DEADLINE_TRANSITION_KINDS,
} from './governance-deadline.rules';

const NOW = new Date('2026-07-22T12:00:00.000Z');

function buildState() {
  return {
    status: GOVERNANCE_CASE_STATUS.OPEN,
    firstReviewAt: new Date('2026-07-22T11:00:00.000Z'),
    firstReviewedAt: null,
    normalDeadlineAt: new Date('2026-07-24T11:00:00.000Z'),
    emergencyDeadlineAt: new Date('2026-07-24T19:00:00.000Z'),
    violationTally: 0,
    notViolationTally: 0,
  };
}

describe('calculateGovernanceDeadlineTransition', () => {
  it('keeps an unresolved case open after its first review and schedules the normal deadline', () => {
    expect(calculateGovernanceDeadlineTransition(buildState(), NOW)).toEqual({
      kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.ADVANCE,
      status: GOVERNANCE_CASE_STATUS.OPEN,
      firstReviewedAt: NOW,
      nextTransitionAt: new Date('2026-07-24T11:00:00.000Z'),
    });
  });

  it('resolves a decisive case at its first review', () => {
    expect(
      calculateGovernanceDeadlineTransition({ ...buildState(), violationTally: 6 }, NOW),
    ).toEqual({
      kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.RESOLVE,
      resolution: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
    });
  });

  it('moves a reviewed case to emergency and schedules the final deadline', () => {
    const firstReviewedAt = new Date('2026-07-22T11:00:00.000Z');
    expect(
      calculateGovernanceDeadlineTransition(
        {
          ...buildState(),
          firstReviewedAt,
          normalDeadlineAt: new Date('2026-07-22T11:30:00.000Z'),
        },
        NOW,
      ),
    ).toEqual({
      kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.ADVANCE,
      status: GOVERNANCE_CASE_STATUS.EMERGENCY,
      firstReviewedAt,
      nextTransitionAt: new Date('2026-07-24T19:00:00.000Z'),
    });
  });

  it('uses the final-deadline rule for an expired emergency case', () => {
    expect(
      calculateGovernanceDeadlineTransition(
        {
          ...buildState(),
          status: GOVERNANCE_CASE_STATUS.EMERGENCY,
          firstReviewedAt: new Date('2026-07-22T11:00:00.000Z'),
          emergencyDeadlineAt: new Date('2026-07-22T11:30:00.000Z'),
          violationTally: 5,
        },
        NOW,
      ),
    ).toEqual({
      kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.RESOLVE,
      resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
    });
  });
});
