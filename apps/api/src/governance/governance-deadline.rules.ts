import { GOVERNANCE_CASE_STATUS, type GovernanceCaseStatus } from './governance.constants';
import {
  finalizeGovernanceCaseAtFinalDeadline,
  shouldResolveGovernanceCase,
} from './governance.rules';

export const GOVERNANCE_DEADLINE_TRANSITION_KINDS = {
  NOT_DUE: 'NOT_DUE',
  ADVANCE: 'ADVANCE',
  RESOLVE: 'RESOLVE',
} as const;

interface GovernanceDeadlineState {
  status: GovernanceCaseStatus;
  firstReviewAt: Date;
  firstReviewedAt: Date | null;
  normalDeadlineAt: Date;
  emergencyDeadlineAt: Date;
  violationTally: number;
  notViolationTally: number;
}

export type GovernanceDeadlineTransition =
  | { kind: typeof GOVERNANCE_DEADLINE_TRANSITION_KINDS.NOT_DUE }
  | {
      kind: typeof GOVERNANCE_DEADLINE_TRANSITION_KINDS.ADVANCE;
      status: typeof GOVERNANCE_CASE_STATUS.OPEN | typeof GOVERNANCE_CASE_STATUS.EMERGENCY;
      firstReviewedAt: Date;
      nextTransitionAt: Date;
    }
  | {
      kind: typeof GOVERNANCE_DEADLINE_TRANSITION_KINDS.RESOLVE;
      resolution:
        | typeof GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
        | typeof GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION;
    };

function requireTerminalResolution(
  status: GovernanceCaseStatus,
):
  | typeof GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
  | typeof GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION {
  if (
    status === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION ||
    status === GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION
  ) {
    return status;
  }
  throw new Error(`治理截止规则返回了非终态结果: ${status}`);
}

export function calculateGovernanceDeadlineTransition(
  state: GovernanceDeadlineState,
  now: Date,
): GovernanceDeadlineTransition {
  if (
    state.status === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION ||
    state.status === GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION
  ) {
    return { kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.NOT_DUE };
  }

  if (state.status === GOVERNANCE_CASE_STATUS.OPEN) {
    if (!state.firstReviewedAt) {
      if (state.firstReviewAt > now) {
        return { kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.NOT_DUE };
      }
      const firstReview = shouldResolveGovernanceCase(
        state.violationTally,
        state.notViolationTally,
      );
      if (firstReview.resolved && firstReview.resolution) {
        return {
          kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.RESOLVE,
          resolution: requireTerminalResolution(firstReview.resolution),
        };
      }
      const emergency = state.normalDeadlineAt <= now;
      return {
        kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.ADVANCE,
        status: emergency ? GOVERNANCE_CASE_STATUS.EMERGENCY : GOVERNANCE_CASE_STATUS.OPEN,
        firstReviewedAt: now,
        nextTransitionAt: emergency ? state.emergencyDeadlineAt : state.normalDeadlineAt,
      };
    }

    if (state.normalDeadlineAt > now) {
      return { kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.NOT_DUE };
    }
    return {
      kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.ADVANCE,
      status: GOVERNANCE_CASE_STATUS.EMERGENCY,
      firstReviewedAt: state.firstReviewedAt,
      nextTransitionAt: state.emergencyDeadlineAt,
    };
  }

  if (state.emergencyDeadlineAt > now) {
    return { kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.NOT_DUE };
  }
  return {
    kind: GOVERNANCE_DEADLINE_TRANSITION_KINDS.RESOLVE,
    resolution: requireTerminalResolution(
      finalizeGovernanceCaseAtFinalDeadline(state.violationTally, state.notViolationTally),
    ),
  };
}
