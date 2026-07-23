import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS,
  CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS,
  CIRCLE_PROPOSAL_DEADLINE_QUEUE,
  CIRCLE_PROPOSAL_DEADLINE_WORKER_CONCURRENCY,
  type CircleProposalDeadlineJob,
} from './circle-proposal-deadline.constants';
import { CircleProposalDeadlinePublisher } from './circle-proposal-deadline.publisher';
import { CircleProposalDeadlineService } from './circle-proposal-deadline.service';

@Processor(CIRCLE_PROPOSAL_DEADLINE_QUEUE, {
  concurrency: CIRCLE_PROPOSAL_DEADLINE_WORKER_CONCURRENCY,
})
export class CircleProposalDeadlineProcessor extends WorkerHost {
  constructor(
    private readonly publisher: CircleProposalDeadlinePublisher,
    private readonly deadlineService: CircleProposalDeadlineService,
  ) {
    super();
  }

  async process(job: Job<CircleProposalDeadlineJob>): Promise<void> {
    try {
      if (job.data.kind === CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.PUBLISH) {
        await this.publisher.publishPendingBatch();
        return;
      }
      if (job.data.kind === CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.COMPENSATE) {
        await this.publisher.publishCompensationBatch();
        return;
      }
      if (job.data.kind === CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.ADVANCE_PROPOSAL) {
        await this.deadlineService.processProposal(job.data.proposalId, job.data.deadlineVersion);
        return;
      }
      throw new Error('共建提案截止队列任务类型无效');
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (
        job.data.kind === CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.ADVANCE_PROPOSAL &&
        job.attemptsMade + 1 >= (job.opts.attempts ?? CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS)
      ) {
        await this.deadlineService.releaseFailedDelivery(
          job.data.proposalId,
          job.data.deadlineVersion,
          job.data.deliveryToken,
        );
      }
      throw failure;
    }
  }
}
