export const HOT_RANKING_PROJECTION_QUEUE = 'hot-ranking-projection';
export const HOT_RANKING_CANDIDATE_QUEUE = 'hot-ranking-candidate';
export const HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE = 'hot-ranking-candidate-maintenance';

export const HOT_PROJECTION_JOB_KINDS = {
  DISPATCH: 'DISPATCH',
  PROJECT_POST: 'PROJECT_POST',
  EXPIRE: 'EXPIRE',
} as const;

export const HOT_CANDIDATE_JOB_KINDS = {
  DISPATCH: 'DISPATCH',
  SYNC_POST: 'SYNC_POST',
  ENSURE_GENERATION: 'ENSURE_GENERATION',
  REBUILD_BATCH: 'REBUILD_BATCH',
  CLEANUP_GENERATION: 'CLEANUP_GENERATION',
} as const;

export const HOT_PROJECTION_JOB_NAMES = {
  DISPATCH: 'dispatch-projection',
  PROJECT_POST: 'project-post',
  EXPIRE: 'expire-hot-posts',
} as const;

export const HOT_CANDIDATE_JOB_NAMES = {
  DISPATCH: 'dispatch-candidates',
  SYNC_POST: 'sync-candidate',
  ENSURE_GENERATION: 'ensure-generation',
  REBUILD_BATCH: 'rebuild-generation-batch',
  CLEANUP_GENERATION: 'cleanup-generation',
} as const;

export const HOT_POST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CIRCLE_HOT_POSTS = 3;

export const HOT_EFFECTIVE_REPLY_CAP = 20;
export const HOT_POSITIVE_FEEDBACK_WEIGHT = 3;
export const HOT_PARTICIPANT_WEIGHT = 2;
export const HOT_AGE_OFFSET_HOURS = 2;
export const HOT_DECAY_EXPONENT = 1.5;
export const HOT_MIN_PARTICIPANT_COUNT = 5;
export const HOT_MIN_POSITIVE_OWNER_COUNT = 2;

export const HOT_PROJECTION_WORK_BATCH_SIZE = 12;
export const HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE = 50;
export const HOT_REPLY_BRANCH_FANOUT_BATCH_SIZE = 50;
export const HOT_DISPATCH_BATCH_SIZE = 20;
export const HOT_CANDIDATE_REBUILD_BATCH_SIZE = 250;
export const HOT_CANDIDATE_CLEANUP_BATCH_SIZE = 200;
export const HOT_GENERATION_RECONCILE_BATCH_SIZE = 20;
export const HOT_GENERATION_CONSISTENCY_LIMIT = 3;
export const HOT_WORK_CLAIM_TTL_MS = 60_000;
export const HOT_DISPATCH_INTERVAL_MS = 1_000;
export const HOT_EXPIRY_INTERVAL_MS = 1_000;
export const HOT_GENERATION_CHECK_INTERVAL_MS = 10_000;
export const HOT_DISPATCH_RETRY_BASE_DELAY_MS = 1_000;
export const HOT_DISPATCH_RETRY_MAX_DELAY_MS = 60_000;
export const HOT_DISPATCH_RETRY_EXPONENT_CAP = 6;

export const HOT_JOB_ATTEMPTS = 4;
export const HOT_JOB_BACKOFF_MS = 1_000;
export const HOT_FAILED_JOB_RETENTION = 100;
export const HOT_PROJECTION_WORKER_CONCURRENCY = 2;
export const HOT_CANDIDATE_WORKER_CONCURRENCY = 1;
export const HOT_CANDIDATE_MAINTENANCE_WORKER_CONCURRENCY = 1;
export const HOT_INCREMENTAL_JOB_PRIORITY = 1;
export const HOT_MAINTENANCE_JOB_PRIORITY = 10;

export const HOT_CANDIDATE_ACTIVE_GENERATION_KEY = 'skynet:v2:hot-posts:active-generation';
export const HOT_CANDIDATE_BUILDING_GENERATION_KEY = 'skynet:v2:hot-posts:building-generation';
export const HOT_CANDIDATE_KEY_PREFIX = 'skynet:v2:hot-posts:generation:';
export const HOT_SNAPSHOT_KEY_PREFIX = 'skynet:v2:hot-snapshot:';
export const HOT_SNAPSHOT_TTL_SECONDS = 300;
export const HOT_SNAPSHOT_SAMPLE_SIZE = 1_000;
export const HOT_PAGE_SCAN_SIZE = 300;
export const HOT_POST_MAX_PAGE_SIZE = 100;
export const HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER = 3;
