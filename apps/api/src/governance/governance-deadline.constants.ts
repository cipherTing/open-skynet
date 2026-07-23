export const GOVERNANCE_DEADLINE_QUEUE = 'governance-deadline';

export const GOVERNANCE_DEADLINE_JOB_KINDS = {
  PUBLISH: 'PUBLISH',
  COMPENSATE: 'COMPENSATE',
  ADVANCE_CASE: 'ADVANCE_CASE',
} as const;

export const GOVERNANCE_DEADLINE_JOB_NAMES = {
  PUBLISH: 'publish',
  COMPENSATE: 'compensate',
  ADVANCE_CASE: 'advance-case',
} as const;

export const GOVERNANCE_DEADLINE_SCHEDULER_IDS = {
  PUBLISH: 'governance-deadline-publisher',
  COMPENSATE: 'governance-deadline-compensator',
} as const;
export const GOVERNANCE_DEADLINE_PUBLISH_INTERVAL_MS = 1_000;
export const GOVERNANCE_DEADLINE_COMPENSATION_INTERVAL_MS = 10_000;
export const GOVERNANCE_DEADLINE_COMPENSATION_RETRY_MS = 5 * 60 * 1000;
export const GOVERNANCE_DEADLINE_BATCH_SIZE = 50;
export const GOVERNANCE_DEADLINE_WORKER_CONCURRENCY = 1;
export const GOVERNANCE_DEADLINE_CLAIM_TTL_MS = 5 * 60 * 1000;
export const GOVERNANCE_DEADLINE_PUBLISH_CLAIM_TTL_MS = 30_000;
export const GOVERNANCE_DEADLINE_JOB_ATTEMPTS = 5;
export const GOVERNANCE_DEADLINE_DEFAULT_JOB_ATTEMPTS = 1;
export const GOVERNANCE_DEADLINE_JOB_BACKOFF_MS = 1_000;
export const GOVERNANCE_DEADLINE_JOB_BACKOFF_JITTER = 0.5;
export const GOVERNANCE_DEADLINE_CONTROL_JOB_PRIORITY = 1;
export const GOVERNANCE_DEADLINE_JOB_PRIORITY = 0;
export const GOVERNANCE_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID =
  'governance-deadline-compensation-continuation';
export const GOVERNANCE_DEADLINE_COMPLETED_RETENTION = {
  age: 60 * 60,
  count: 1_000,
} as const;
export const GOVERNANCE_DEADLINE_FAILED_RETENTION = {
  age: 7 * 24 * 60 * 60,
  count: 5_000,
} as const;

export type GovernanceDeadlineJob =
  | { kind: typeof GOVERNANCE_DEADLINE_JOB_KINDS.PUBLISH }
  | { kind: typeof GOVERNANCE_DEADLINE_JOB_KINDS.COMPENSATE }
  | {
      kind: typeof GOVERNANCE_DEADLINE_JOB_KINDS.ADVANCE_CASE;
      caseId: string;
      deadlineVersion: number;
      deliveryToken: string;
    };

export function getGovernanceDeadlineJobId(deliveryToken: string): string {
  return `governance-deadline-${deliveryToken}`;
}

export function getGovernanceDeadlineDeduplicationId(
  caseId: string,
  deadlineVersion: number,
): string {
  return `governance-case-${caseId}-deadline-${deadlineVersion}`;
}
