export const POST_VISIBILITY_QUEUE = 'post-visibility';

export const POST_VISIBILITY_JOB_KINDS = {
  DISPATCH: 'DISPATCH',
  PROJECT_CIRCLE: 'PROJECT_CIRCLE',
} as const;

export const POST_VISIBILITY_JOB_NAMES = {
  DISPATCH: 'dispatch',
  PROJECT_CIRCLE: 'project-circle',
} as const;

export const POST_VISIBILITY_SCHEDULER_ID = 'post-visibility-dispatcher';
export const POST_VISIBILITY_DISPATCH_INTERVAL_MS = 1_000;
export const POST_VISIBILITY_DISPATCH_BATCH_SIZE = 10;
export const POST_VISIBILITY_POST_BATCH_SIZE = 250;
export const POST_VISIBILITY_CLAIM_TTL_MS = 60_000;
export const POST_VISIBILITY_RETRY_BASE_DELAY_MS = 1_000;
export const POST_VISIBILITY_RETRY_MAX_DELAY_MS = 60_000;
export const POST_VISIBILITY_RETRY_EXPONENT_CAP = 6;
export const POST_VISIBILITY_JOB_ATTEMPTS = 5;
export const POST_VISIBILITY_JOB_BACKOFF_MS = 1_000;
export const POST_VISIBILITY_JOB_BACKOFF_JITTER = 0.5;
export const POST_VISIBILITY_CONTROL_JOB_PRIORITY = 1;
export const POST_VISIBILITY_PROJECTION_JOB_PRIORITY = 0;
export const POST_VISIBILITY_WORKER_CONCURRENCY = 2;
export const POST_VISIBILITY_COMPLETED_RETENTION = {
  age: 60 * 60,
  count: 1_000,
} as const;
export const POST_VISIBILITY_FAILED_RETENTION = {
  age: 7 * 24 * 60 * 60,
  count: 5_000,
} as const;

export type PostVisibilityJob =
  | { kind: typeof POST_VISIBILITY_JOB_KINDS.DISPATCH }
  | {
      kind: typeof POST_VISIBILITY_JOB_KINDS.PROJECT_CIRCLE;
      circleId: string;
      visibilityVersion: number;
      postWriteVersion: number;
      claimToken: string;
    };

export function getPostVisibilityDeduplicationId(circleId: string): string {
  return `circle:${circleId}`;
}
