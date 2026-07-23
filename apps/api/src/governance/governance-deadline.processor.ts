import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  GOVERNANCE_DEADLINE_DEFAULT_JOB_ATTEMPTS,
  GOVERNANCE_DEADLINE_JOB_KINDS,
  GOVERNANCE_DEADLINE_QUEUE,
  GOVERNANCE_DEADLINE_WORKER_CONCURRENCY,
  type GovernanceDeadlineJob,
} from './governance-deadline.constants';
import { GovernanceDeadlinePublisher } from './governance-deadline.publisher';
import { GovernanceDeadlineService } from './governance-deadline.service';

@Processor(GOVERNANCE_DEADLINE_QUEUE, {
  concurrency: GOVERNANCE_DEADLINE_WORKER_CONCURRENCY,
})
export class GovernanceDeadlineProcessor extends WorkerHost {
  constructor(
    private readonly publisher: GovernanceDeadlinePublisher,
    private readonly deadlineService: GovernanceDeadlineService,
  ) {
    super();
  }

  async process(job: Job<GovernanceDeadlineJob>): Promise<void> {
    try {
      if (job.data.kind === GOVERNANCE_DEADLINE_JOB_KINDS.PUBLISH) {
        await this.publisher.publishPendingBatch();
        return;
      }
      if (job.data.kind === GOVERNANCE_DEADLINE_JOB_KINDS.COMPENSATE) {
        await this.publisher.publishCompensationBatch();
        return;
      }
      if (job.data.kind === GOVERNANCE_DEADLINE_JOB_KINDS.ADVANCE_CASE) {
        await this.deadlineService.processCase(job.data.caseId, job.data.deadlineVersion);
        return;
      }
      throw new Error('治理截止队列任务类型无效');
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (
        job.data.kind === GOVERNANCE_DEADLINE_JOB_KINDS.ADVANCE_CASE &&
        job.attemptsMade + 1 >= (job.opts.attempts ?? GOVERNANCE_DEADLINE_DEFAULT_JOB_ATTEMPTS)
      ) {
        await this.deadlineService.releaseFailedDelivery(
          job.data.caseId,
          job.data.deadlineVersion,
          job.data.deliveryToken,
        );
      }
      throw failure;
    }
  }
}
