import { CIRCLE_PROPOSAL_STATUSES } from './circle.constants';

export const CIRCLE_PROPOSAL_DEADLINE_QUEUE = 'circle-proposal-deadline';

export const ACTIVE_CIRCLE_PROPOSAL_STATUSES = [
  CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
  CIRCLE_PROPOSAL_STATUSES.VOTING,
] as const;

export const CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS = {
  PUBLISH: 'PUBLISH',
  COMPENSATE: 'COMPENSATE',
  ADVANCE_PROPOSAL: 'ADVANCE_PROPOSAL',
} as const;

export const CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES = {
  PUBLISH: 'publish',
  COMPENSATE: 'compensate',
  ADVANCE_PROPOSAL: 'advance-proposal',
} as const;

export const CIRCLE_PROPOSAL_DEADLINE_SCHEDULER_IDS = {
  PUBLISH: 'circle-proposal-deadline-publisher',
  COMPENSATE: 'circle-proposal-deadline-compensator',
} as const;

export const CIRCLE_PROPOSAL_DEADLINE_PUBLISH_INTERVAL_MS = 1_000;
export const CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_INTERVAL_MS = 10_000;
export const CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS = 5 * 60 * 1000;
export const CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE = 50;
export const CIRCLE_PROPOSAL_DEADLINE_WORKER_CONCURRENCY = 1;
export const CIRCLE_PROPOSAL_DEADLINE_CLAIM_TTL_MS = 5 * 60 * 1000;
export const CIRCLE_PROPOSAL_DEADLINE_PUBLISH_CLAIM_TTL_MS = 30_000;
export const CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS = 5;
export const CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_MS = 1_000;
export const CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_JITTER = 0.5;
export const CIRCLE_PROPOSAL_DEADLINE_CONTROL_JOB_PRIORITY = 1;
export const CIRCLE_PROPOSAL_DEADLINE_JOB_PRIORITY = 0;
export const CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID =
  'circle-proposal-deadline-compensation-continuation';
export const CIRCLE_PROPOSAL_DEADLINE_COMPLETED_RETENTION = {
  age: 60 * 60,
  count: 1_000,
} as const;
export const CIRCLE_PROPOSAL_DEADLINE_FAILED_RETENTION = {
  age: 7 * 24 * 60 * 60,
  count: 5_000,
} as const;

export type CircleProposalDeadlineJob =
  | { kind: typeof CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.PUBLISH }
  | { kind: typeof CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.COMPENSATE }
  | {
      kind: typeof CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.ADVANCE_PROPOSAL;
      proposalId: string;
      deadlineVersion: number;
      deliveryToken: string;
    };

export function getCircleProposalDeadlineJobId(deliveryToken: string): string {
  return `circle-proposal-deadline-${deliveryToken}`;
}

export function getCircleProposalDeadlineDeduplicationId(
  proposalId: string,
  deadlineVersion: number,
): string {
  return `circle-proposal-${proposalId}-deadline-${deadlineVersion}`;
}
