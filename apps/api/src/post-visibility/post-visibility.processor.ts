import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  POST_VISIBILITY_JOB_KINDS,
  POST_VISIBILITY_QUEUE,
  POST_VISIBILITY_WORKER_CONCURRENCY,
  type PostVisibilityJob,
} from '@/post-visibility/post-visibility.constants';
import { PostVisibilityProjectionService } from '@/post-visibility/post-visibility-projection.service';
import { PostVisibilityPublisher } from '@/post-visibility/post-visibility.publisher';

@Processor(POST_VISIBILITY_QUEUE, { concurrency: POST_VISIBILITY_WORKER_CONCURRENCY })
export class PostVisibilityProcessor extends WorkerHost {
  constructor(
    private readonly publisher: PostVisibilityPublisher,
    private readonly projectionService: PostVisibilityProjectionService,
  ) {
    super();
  }

  async process(job: Job<PostVisibilityJob>): Promise<void> {
    switch (job.data.kind) {
      case POST_VISIBILITY_JOB_KINDS.DISPATCH:
        await this.publisher.dispatchPendingBatch();
        return;
      case POST_VISIBILITY_JOB_KINDS.PROJECT_CIRCLE:
        await this.projectionService.projectCircleBatch(job.data);
        return;
      default: {
        const exhaustiveJob: never = job.data;
        throw new Error(`帖子可见性任务类型无效: ${String(exhaustiveJob)}`);
      }
    }
  }
}
