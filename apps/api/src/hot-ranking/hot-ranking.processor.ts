import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import {
  HOT_CANDIDATE_JOB_KINDS,
  HOT_CANDIDATE_JOB_NAMES,
  HOT_CANDIDATE_MAINTENANCE_WORKER_CONCURRENCY,
  HOT_CANDIDATE_WORKER_CONCURRENCY,
  HOT_DISPATCH_INTERVAL_MS,
  HOT_EXPIRY_INTERVAL_MS,
  HOT_FAILED_JOB_RETENTION,
  HOT_GENERATION_CHECK_INTERVAL_MS,
  HOT_INCREMENTAL_JOB_PRIORITY,
  HOT_JOB_ATTEMPTS,
  HOT_JOB_BACKOFF_MS,
  HOT_MAINTENANCE_JOB_PRIORITY,
  HOT_PROJECTION_JOB_KINDS,
  HOT_PROJECTION_JOB_NAMES,
  HOT_PROJECTION_WORKER_CONCURRENCY,
  HOT_RANKING_CANDIDATE_QUEUE,
  HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE,
  HOT_RANKING_PROJECTION_QUEUE,
} from '@/hot-ranking/hot-ranking.constants';
import type {
  HotCandidateJob,
  HotCandidateMaintenanceJob,
  HotProjectionJob,
} from '@/hot-ranking/hot-ranking.types';
import { HotRankingProjectionService } from '@/hot-ranking/hot-ranking-projection.service';
import { HotCandidateIndexService } from '@/hot-ranking/hot-candidate-index.service';

const HOT_SCHEDULER_IDS = {
  PROJECTION_DISPATCH: 'hot-projection-dispatch',
  EXPIRY: 'hot-expiry',
  CANDIDATE_DISPATCH: 'hot-candidate-dispatch',
  GENERATION: 'hot-candidate-generation',
} as const;

@Injectable()
export class HotRankingScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(HOT_RANKING_PROJECTION_QUEUE)
    private readonly projectionQueue: Queue<HotProjectionJob>,
    @InjectQueue(HOT_RANKING_CANDIDATE_QUEUE)
    private readonly candidateQueue: Queue<HotCandidateJob>,
    @InjectQueue(HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE)
    private readonly candidateMaintenanceQueue: Queue<HotCandidateMaintenanceJob>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.projectionQueue.upsertJobScheduler(
      HOT_SCHEDULER_IDS.PROJECTION_DISPATCH,
      { every: HOT_DISPATCH_INTERVAL_MS },
      {
        name: HOT_PROJECTION_JOB_NAMES.DISPATCH,
        data: { kind: HOT_PROJECTION_JOB_KINDS.DISPATCH },
        opts: {
          attempts: HOT_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: HOT_FAILED_JOB_RETENTION,
          priority: HOT_INCREMENTAL_JOB_PRIORITY,
        },
      },
    );
    await this.projectionQueue.upsertJobScheduler(
      HOT_SCHEDULER_IDS.EXPIRY,
      { every: HOT_EXPIRY_INTERVAL_MS },
      {
        name: HOT_PROJECTION_JOB_NAMES.EXPIRE,
        data: { kind: HOT_PROJECTION_JOB_KINDS.EXPIRE },
        opts: {
          attempts: HOT_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: HOT_FAILED_JOB_RETENTION,
          priority: HOT_INCREMENTAL_JOB_PRIORITY,
        },
      },
    );
    await this.candidateQueue.upsertJobScheduler(
      HOT_SCHEDULER_IDS.CANDIDATE_DISPATCH,
      { every: HOT_DISPATCH_INTERVAL_MS },
      {
        name: HOT_CANDIDATE_JOB_NAMES.DISPATCH,
        data: { kind: HOT_CANDIDATE_JOB_KINDS.DISPATCH },
        opts: {
          attempts: HOT_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: HOT_FAILED_JOB_RETENTION,
          priority: HOT_INCREMENTAL_JOB_PRIORITY,
        },
      },
    );
    await this.candidateMaintenanceQueue.upsertJobScheduler(
      HOT_SCHEDULER_IDS.GENERATION,
      { every: HOT_GENERATION_CHECK_INTERVAL_MS },
      {
        name: HOT_CANDIDATE_JOB_NAMES.ENSURE_GENERATION,
        data: { kind: HOT_CANDIDATE_JOB_KINDS.ENSURE_GENERATION },
        opts: {
          attempts: HOT_JOB_ATTEMPTS,
          backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: HOT_FAILED_JOB_RETENTION,
          priority: HOT_MAINTENANCE_JOB_PRIORITY,
        },
      },
    );
  }
}

@Processor(HOT_RANKING_PROJECTION_QUEUE, { concurrency: HOT_PROJECTION_WORKER_CONCURRENCY })
export class HotProjectionProcessor extends WorkerHost {
  constructor(private readonly projectionService: HotRankingProjectionService) {
    super();
  }

  async process(job: Job<HotProjectionJob>): Promise<void> {
    try {
      switch (job.data.kind) {
        case HOT_PROJECTION_JOB_KINDS.DISPATCH:
          await this.projectionService.dispatchDirtyPosts();
          return;
        case HOT_PROJECTION_JOB_KINDS.EXPIRE:
          await this.projectionService.expireDueStates();
          return;
        case HOT_PROJECTION_JOB_KINDS.PROJECT_POST:
          await this.projectionService.projectPost(job.data.postId, job.data.signalVersion);
          return;
        default:
          throw new Error('热度投影任务类型无效');
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      throw failure;
    }
  }
}

@Processor(HOT_RANKING_CANDIDATE_QUEUE, { concurrency: HOT_CANDIDATE_WORKER_CONCURRENCY })
export class HotCandidateProcessor extends WorkerHost {
  constructor(private readonly candidateService: HotCandidateIndexService) {
    super();
  }

  async process(job: Job<HotCandidateJob>): Promise<void> {
    try {
      switch (job.data.kind) {
        case HOT_CANDIDATE_JOB_KINDS.DISPATCH:
          await this.candidateService.dispatchDirtyCandidates();
          return;
        case HOT_CANDIDATE_JOB_KINDS.SYNC_POST:
          await this.candidateService.syncCandidate(job.data.postId);
          return;
        default:
          throw new Error('热帖候选增量任务类型无效');
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      throw failure;
    }
  }
}

@Processor(HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE, {
  concurrency: HOT_CANDIDATE_MAINTENANCE_WORKER_CONCURRENCY,
})
export class HotCandidateMaintenanceProcessor extends WorkerHost {
  constructor(private readonly candidateService: HotCandidateIndexService) {
    super();
  }

  async process(job: Job<HotCandidateMaintenanceJob>): Promise<void> {
    try {
      switch (job.data.kind) {
        case HOT_CANDIDATE_JOB_KINDS.ENSURE_GENERATION:
          await this.candidateService.ensureCandidateGeneration();
          return;
        case HOT_CANDIDATE_JOB_KINDS.REBUILD_BATCH:
          await this.candidateService.rebuildCandidateBatch(
            job.data.generationId,
            job.data.generationVersion,
          );
          return;
        case HOT_CANDIDATE_JOB_KINDS.CLEANUP_GENERATION:
          await this.candidateService.cleanupGeneration(
            job.data.generationId,
            job.data.generationVersion,
          );
          return;
        default:
          throw new Error('热帖候选维护任务类型无效');
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      throw failure;
    }
  }
}
