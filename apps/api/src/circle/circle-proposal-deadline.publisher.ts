import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import {
  ACTIVE_CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE,
  CIRCLE_PROPOSAL_DEADLINE_CLAIM_TTL_MS,
  CIRCLE_PROPOSAL_DEADLINE_COMPLETED_RETENTION,
  CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_INTERVAL_MS,
  CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
  CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS,
  CIRCLE_PROPOSAL_DEADLINE_CONTROL_JOB_PRIORITY,
  CIRCLE_PROPOSAL_DEADLINE_FAILED_RETENTION,
  CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS,
  CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_JITTER,
  CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_MS,
  CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS,
  CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES,
  CIRCLE_PROPOSAL_DEADLINE_JOB_PRIORITY,
  CIRCLE_PROPOSAL_DEADLINE_PUBLISH_CLAIM_TTL_MS,
  CIRCLE_PROPOSAL_DEADLINE_PUBLISH_INTERVAL_MS,
  CIRCLE_PROPOSAL_DEADLINE_QUEUE,
  CIRCLE_PROPOSAL_DEADLINE_SCHEDULER_IDS,
  getCircleProposalDeadlineDeduplicationId,
  getCircleProposalDeadlineJobId,
  type CircleProposalDeadlineJob,
} from './circle-proposal-deadline.constants';

interface CircleProposalDeadlineCandidate {
  _id: Types.ObjectId;
  nextTransitionAt: Date;
  deadlineVersion: number;
}

interface CircleProposalDeadlineDelivery extends CircleProposalDeadlineCandidate {
  deliveryToken: string;
}

@Injectable()
export class CircleProposalDeadlinePublisher implements OnModuleInit {
  constructor(
    @InjectQueue(CIRCLE_PROPOSAL_DEADLINE_QUEUE)
    private readonly queue: Queue<CircleProposalDeadlineJob>,
    @InjectModel(CircleProposal.name)
    private readonly proposalModel: Model<CircleProposal>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CIRCLE_PROPOSAL_DEADLINE_SCHEDULER_IDS.PUBLISH,
      { every: CIRCLE_PROPOSAL_DEADLINE_PUBLISH_INTERVAL_MS },
      {
        name: CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES.PUBLISH,
        data: { kind: CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.PUBLISH },
        opts: this.getSchedulerJobOptions(),
      },
    );
    await this.queue.upsertJobScheduler(
      CIRCLE_PROPOSAL_DEADLINE_SCHEDULER_IDS.COMPENSATE,
      { every: CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_INTERVAL_MS },
      {
        name: CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES.COMPENSATE,
        data: { kind: CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.COMPENSATE },
        opts: this.getSchedulerJobOptions(),
      },
    );
  }

  async publishPendingBatch(): Promise<void> {
    const now = new Date();
    const candidates = await this.proposalModel
      .find({
        status: { $in: ACTIVE_CIRCLE_PROPOSAL_STATUSES },
        activeGovernanceCaseId: null,
        nextTransitionAt: { $ne: null },
        deadlineScheduleDispatchAt: { $lte: now },
        $expr: { $lt: ['$deadlinePublishedVersion', '$deadlineVersion'] },
        $or: [
          { deadlineScheduleClaimExpiresAt: null },
          { deadlineScheduleClaimExpiresAt: { $lte: now } },
        ],
      })
      .select('_id nextTransitionAt deadlineVersion')
      .sort({ deadlineScheduleDispatchAt: 1, _id: 1 })
      .limit(CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE)
      .lean<CircleProposalDeadlineCandidate[]>();
    if (candidates.length === 0) return;

    const batchClaimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + CIRCLE_PROPOSAL_DEADLINE_PUBLISH_CLAIM_TTL_MS);
    const deliveryTokenById = new Map(
      candidates.map((candidate) => [candidate._id.toString(), randomUUID()]),
    );
    await this.proposalModel.bulkWrite(
      candidates.map((candidate) => ({
        updateOne: {
          filter: {
            _id: candidate._id,
            status: { $in: ACTIVE_CIRCLE_PROPOSAL_STATUSES },
            activeGovernanceCaseId: null,
            deadlineVersion: candidate.deadlineVersion,
            deadlinePublishedVersion: { $lt: candidate.deadlineVersion },
            deadlineScheduleDispatchAt: { $lte: now },
            $or: [
              { deadlineScheduleClaimExpiresAt: null },
              { deadlineScheduleClaimExpiresAt: { $lte: now } },
            ],
          },
          update: {
            $set: {
              deadlineScheduleClaimVersion: candidate.deadlineVersion,
              deadlineScheduleClaimToken: batchClaimToken,
              deadlineScheduleClaimExpiresAt: claimExpiresAt,
              deadlineScheduleDeliveryToken: deliveryTokenById.get(candidate._id.toString()),
            },
          },
        },
      })),
    );
    const claimed = await this.proposalModel
      .find({ deadlineScheduleClaimToken: batchClaimToken })
      .select(
        '_id nextTransitionAt deadlineVersion +deadlineScheduleClaimToken +deadlineScheduleDeliveryToken',
      )
      .lean<Array<CircleProposalDeadlineCandidate & { deadlineScheduleDeliveryToken: string }>>();
    const deliveries = claimed.map((candidate) => ({
      _id: candidate._id,
      nextTransitionAt: candidate.nextTransitionAt,
      deadlineVersion: candidate.deadlineVersion,
      deliveryToken: candidate.deadlineScheduleDeliveryToken,
    }));
    if (deliveries.length === 0) return;

    try {
      await this.addProposalJobs(deliveries, now);
      await this.proposalModel.bulkWrite(
        deliveries.map((delivery) => ({
          updateOne: {
            filter: {
              _id: delivery._id,
              deadlineVersion: delivery.deadlineVersion,
              deadlineScheduleClaimVersion: delivery.deadlineVersion,
              deadlineScheduleClaimToken: batchClaimToken,
              deadlineScheduleDeliveryToken: delivery.deliveryToken,
            },
            update: {
              $set: {
                deadlinePublishedVersion: delivery.deadlineVersion,
                deadlineScheduleDispatchAt: null,
                deadlineScheduleClaimVersion: null,
                deadlineScheduleClaimToken: null,
                deadlineScheduleClaimExpiresAt: null,
                deadlineScheduleDeliveryToken: null,
              },
            },
          },
        })),
      );
    } catch (error) {
      await this.releaseScheduleClaims(batchClaimToken);
      throw error;
    }
  }

  async publishCompensationBatch(): Promise<void> {
    const now = new Date();
    const candidates = await this.proposalModel
      .find({
        status: { $in: ACTIVE_CIRCLE_PROPOSAL_STATUSES },
        activeGovernanceCaseId: null,
        nextTransitionAt: { $lte: now },
        $and: [
          {
            $or: [{ deadlineClaimExpiresAt: null }, { deadlineClaimExpiresAt: { $lte: now } }],
          },
          { deadlineCompensationDispatchAt: { $lte: now } },
          {
            $or: [
              { deadlineCompensationClaimExpiresAt: null },
              { deadlineCompensationClaimExpiresAt: { $lte: now } },
            ],
          },
        ],
      })
      .select('_id nextTransitionAt deadlineVersion')
      .sort({ deadlineCompensationDispatchAt: 1, _id: 1 })
      .limit(CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE)
      .lean<CircleProposalDeadlineCandidate[]>();
    if (candidates.length === 0) return;

    const batchClaimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + CIRCLE_PROPOSAL_DEADLINE_PUBLISH_CLAIM_TTL_MS);
    const nextDispatchAt = new Date(now.getTime() + CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS);
    const deliveryLeaseExpiresAt = new Date(now.getTime() + CIRCLE_PROPOSAL_DEADLINE_CLAIM_TTL_MS);
    const deliveryTokenById = new Map(
      candidates.map((candidate) => [candidate._id.toString(), randomUUID()]),
    );
    await this.proposalModel.bulkWrite(
      candidates.map((candidate) => ({
        updateOne: {
          filter: {
            _id: candidate._id,
            status: { $in: ACTIVE_CIRCLE_PROPOSAL_STATUSES },
            activeGovernanceCaseId: null,
            deadlineVersion: candidate.deadlineVersion,
            nextTransitionAt: { $lte: now },
            $and: [
              {
                $or: [{ deadlineClaimExpiresAt: null }, { deadlineClaimExpiresAt: { $lte: now } }],
              },
              { deadlineCompensationDispatchAt: { $lte: now } },
              {
                $or: [
                  { deadlineCompensationClaimExpiresAt: null },
                  { deadlineCompensationClaimExpiresAt: { $lte: now } },
                ],
              },
            ],
          },
          update: {
            $set: {
              deadlineCompensationDispatchAt: nextDispatchAt,
              deadlineCompensationClaimToken: batchClaimToken,
              deadlineCompensationClaimExpiresAt: claimExpiresAt,
              deadlineCompensationDeliveryToken: deliveryTokenById.get(candidate._id.toString()),
            },
          },
        },
      })),
    );
    const claimed = await this.proposalModel
      .find({ deadlineCompensationClaimToken: batchClaimToken })
      .select(
        '_id nextTransitionAt deadlineVersion +deadlineCompensationClaimToken +deadlineCompensationDeliveryToken',
      )
      .lean<
        Array<CircleProposalDeadlineCandidate & { deadlineCompensationDeliveryToken: string }>
      >();
    const deliveries = claimed.map((candidate) => ({
      _id: candidate._id,
      nextTransitionAt: candidate.nextTransitionAt,
      deadlineVersion: candidate.deadlineVersion,
      deliveryToken: candidate.deadlineCompensationDeliveryToken,
    }));
    if (deliveries.length === 0) return;

    try {
      await this.addProposalJobs(deliveries, now);
      await this.proposalModel.updateMany(
        { deadlineCompensationClaimToken: batchClaimToken },
        {
          $set: {
            deadlineCompensationClaimToken: null,
            deadlineCompensationClaimExpiresAt: deliveryLeaseExpiresAt,
          },
        },
      );
      if (deliveries.length === CIRCLE_PROPOSAL_DEADLINE_BATCH_SIZE) {
        await this.enqueueCompensationContinuation();
      }
    } catch (error) {
      await this.proposalModel.updateMany(
        { deadlineCompensationClaimToken: batchClaimToken },
        {
          $set: {
            deadlineCompensationDispatchAt: now,
            deadlineCompensationClaimToken: null,
            deadlineCompensationClaimExpiresAt: null,
            deadlineCompensationDeliveryToken: null,
          },
        },
      );
      throw error;
    }
  }

  private async addProposalJobs(
    deliveries: CircleProposalDeadlineDelivery[],
    now: Date,
  ): Promise<void> {
    await this.queue.addBulk(
      deliveries.map((delivery) => ({
        name: CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES.ADVANCE_PROPOSAL,
        data: {
          kind: CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.ADVANCE_PROPOSAL,
          proposalId: delivery._id.toString(),
          deadlineVersion: delivery.deadlineVersion,
          deliveryToken: delivery.deliveryToken,
        },
        opts: {
          jobId: getCircleProposalDeadlineJobId(delivery.deliveryToken),
          delay: Math.max(0, delivery.nextTransitionAt.getTime() - now.getTime()),
          priority: CIRCLE_PROPOSAL_DEADLINE_JOB_PRIORITY,
          attempts: CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_MS,
            jitter: CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_JITTER,
          },
          deduplication: {
            id: getCircleProposalDeadlineDeduplicationId(
              delivery._id.toString(),
              delivery.deadlineVersion,
            ),
          },
          removeOnComplete: CIRCLE_PROPOSAL_DEADLINE_COMPLETED_RETENTION,
          removeOnFail: CIRCLE_PROPOSAL_DEADLINE_FAILED_RETENTION,
        },
      })),
    );
  }

  private async releaseScheduleClaims(batchClaimToken: string): Promise<void> {
    await this.proposalModel.updateMany(
      { deadlineScheduleClaimToken: batchClaimToken },
      {
        $set: {
          deadlineScheduleClaimVersion: null,
          deadlineScheduleClaimToken: null,
          deadlineScheduleClaimExpiresAt: null,
          deadlineScheduleDeliveryToken: null,
        },
      },
    );
  }

  private async enqueueCompensationContinuation(): Promise<void> {
    await this.queue.add(
      CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES.COMPENSATE,
      { kind: CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.COMPENSATE },
      {
        ...this.getSchedulerJobOptions(),
        deduplication: {
          id: CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
          keepLastIfActive: true,
        },
      },
    );
  }

  private getSchedulerJobOptions() {
    return {
      attempts: CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential' as const,
        delay: CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_MS,
        jitter: CIRCLE_PROPOSAL_DEADLINE_JOB_BACKOFF_JITTER,
      },
      priority: CIRCLE_PROPOSAL_DEADLINE_CONTROL_JOB_PRIORITY,
      removeOnComplete: CIRCLE_PROPOSAL_DEADLINE_COMPLETED_RETENTION,
      removeOnFail: CIRCLE_PROPOSAL_DEADLINE_FAILED_RETENTION,
    };
  }
}
