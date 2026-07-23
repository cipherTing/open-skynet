import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { ACTIVE_GOVERNANCE_CASE_STATUSES } from './governance.constants';
import {
  GOVERNANCE_DEADLINE_BATCH_SIZE,
  GOVERNANCE_DEADLINE_COMPLETED_RETENTION,
  GOVERNANCE_DEADLINE_COMPENSATION_INTERVAL_MS,
  GOVERNANCE_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
  GOVERNANCE_DEADLINE_COMPENSATION_RETRY_MS,
  GOVERNANCE_DEADLINE_CONTROL_JOB_PRIORITY,
  GOVERNANCE_DEADLINE_FAILED_RETENTION,
  GOVERNANCE_DEADLINE_JOB_ATTEMPTS,
  GOVERNANCE_DEADLINE_JOB_BACKOFF_JITTER,
  GOVERNANCE_DEADLINE_JOB_BACKOFF_MS,
  GOVERNANCE_DEADLINE_JOB_KINDS,
  GOVERNANCE_DEADLINE_JOB_NAMES,
  GOVERNANCE_DEADLINE_JOB_PRIORITY,
  GOVERNANCE_DEADLINE_PUBLISH_CLAIM_TTL_MS,
  GOVERNANCE_DEADLINE_PUBLISH_INTERVAL_MS,
  GOVERNANCE_DEADLINE_QUEUE,
  GOVERNANCE_DEADLINE_SCHEDULER_IDS,
  getGovernanceDeadlineDeduplicationId,
  getGovernanceDeadlineJobId,
  type GovernanceDeadlineJob,
} from './governance-deadline.constants';

interface GovernanceDeadlineCandidate {
  _id: Types.ObjectId;
  nextTransitionAt: Date;
  deadlineVersion: number;
}

interface GovernanceDeadlineDelivery extends GovernanceDeadlineCandidate {
  deliveryToken: string;
}

@Injectable()
export class GovernanceDeadlinePublisher implements OnModuleInit {
  constructor(
    @InjectQueue(GOVERNANCE_DEADLINE_QUEUE)
    private readonly queue: Queue<GovernanceDeadlineJob>,
    @InjectModel(GovernanceCase.name)
    private readonly caseModel: Model<GovernanceCase>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      GOVERNANCE_DEADLINE_SCHEDULER_IDS.PUBLISH,
      { every: GOVERNANCE_DEADLINE_PUBLISH_INTERVAL_MS },
      {
        name: GOVERNANCE_DEADLINE_JOB_NAMES.PUBLISH,
        data: { kind: GOVERNANCE_DEADLINE_JOB_KINDS.PUBLISH },
        opts: this.getSchedulerJobOptions(),
      },
    );
    await this.queue.upsertJobScheduler(
      GOVERNANCE_DEADLINE_SCHEDULER_IDS.COMPENSATE,
      { every: GOVERNANCE_DEADLINE_COMPENSATION_INTERVAL_MS },
      {
        name: GOVERNANCE_DEADLINE_JOB_NAMES.COMPENSATE,
        data: { kind: GOVERNANCE_DEADLINE_JOB_KINDS.COMPENSATE },
        opts: this.getSchedulerJobOptions(),
      },
    );
  }

  async publishPendingBatch(): Promise<void> {
    const now = new Date();
    const candidates = await this.caseModel
      .find({
        status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
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
      .limit(GOVERNANCE_DEADLINE_BATCH_SIZE)
      .lean<GovernanceDeadlineCandidate[]>();
    if (candidates.length === 0) return;

    const batchClaimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + GOVERNANCE_DEADLINE_PUBLISH_CLAIM_TTL_MS);
    const pendingDeliveries = candidates.map((candidate) => ({
      ...candidate,
      deliveryToken: randomUUID(),
    }));
    await this.caseModel.bulkWrite(
      pendingDeliveries.map((delivery) => ({
        updateOne: {
          filter: {
            _id: delivery._id,
            status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
            deadlineVersion: delivery.deadlineVersion,
            deadlinePublishedVersion: { $lt: delivery.deadlineVersion },
            deadlineScheduleDispatchAt: { $lte: now },
            $or: [
              { deadlineScheduleClaimExpiresAt: null },
              { deadlineScheduleClaimExpiresAt: { $lte: now } },
            ],
          },
          update: {
            $set: {
              deadlineScheduleClaimVersion: delivery.deadlineVersion,
              deadlineScheduleClaimToken: batchClaimToken,
              deadlineScheduleClaimExpiresAt: claimExpiresAt,
              deadlineScheduleDeliveryToken: delivery.deliveryToken,
            },
          },
        },
      })),
    );
    const claimed = await this.caseModel
      .find({ deadlineScheduleClaimToken: batchClaimToken })
      .select(
        '_id nextTransitionAt deadlineVersion +deadlineScheduleClaimToken +deadlineScheduleDeliveryToken',
      )
      .lean<Array<GovernanceDeadlineCandidate & { deadlineScheduleDeliveryToken: string }>>();
    const deliveries = claimed.map((candidate) => ({
      _id: candidate._id,
      nextTransitionAt: candidate.nextTransitionAt,
      deadlineVersion: candidate.deadlineVersion,
      deliveryToken: candidate.deadlineScheduleDeliveryToken,
    }));
    if (deliveries.length === 0) return;

    try {
      await this.addCaseJobs(deliveries, now);
      await this.caseModel.bulkWrite(
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
    const candidates = await this.caseModel
      .find({
        status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
        nextTransitionAt: { $lte: now },
        deadlineCompensationDispatchAt: { $lte: now },
        $and: [
          {
            $or: [{ deadlineClaimExpiresAt: null }, { deadlineClaimExpiresAt: { $lte: now } }],
          },
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
      .limit(GOVERNANCE_DEADLINE_BATCH_SIZE)
      .lean<GovernanceDeadlineCandidate[]>();
    if (candidates.length === 0) return;

    const batchClaimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + GOVERNANCE_DEADLINE_PUBLISH_CLAIM_TTL_MS);
    const nextCompensationDispatchAt = new Date(
      now.getTime() + GOVERNANCE_DEADLINE_COMPENSATION_RETRY_MS,
    );
    const pendingDeliveries = candidates.map((candidate) => ({
      ...candidate,
      deliveryToken: randomUUID(),
    }));
    await this.caseModel.bulkWrite(
      pendingDeliveries.map((delivery) => ({
        updateOne: {
          filter: {
            _id: delivery._id,
            status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
            deadlineVersion: delivery.deadlineVersion,
            nextTransitionAt: { $lte: now },
            deadlineCompensationDispatchAt: { $lte: now },
            $and: [
              {
                $or: [{ deadlineClaimExpiresAt: null }, { deadlineClaimExpiresAt: { $lte: now } }],
              },
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
              deadlineCompensationClaimToken: batchClaimToken,
              deadlineCompensationClaimExpiresAt: claimExpiresAt,
              deadlineCompensationDeliveryToken: delivery.deliveryToken,
            },
          },
        },
      })),
    );
    const claimed = await this.caseModel
      .find({ deadlineCompensationClaimToken: batchClaimToken })
      .select(
        '_id nextTransitionAt deadlineVersion +deadlineCompensationClaimToken +deadlineCompensationDeliveryToken',
      )
      .lean<Array<GovernanceDeadlineCandidate & { deadlineCompensationDeliveryToken: string }>>();
    const deliveries = claimed.map((candidate) => ({
      _id: candidate._id,
      nextTransitionAt: candidate.nextTransitionAt,
      deadlineVersion: candidate.deadlineVersion,
      deliveryToken: candidate.deadlineCompensationDeliveryToken,
    }));
    if (deliveries.length === 0) return;

    try {
      await this.addCaseJobs(deliveries, now);
    } catch (error) {
      await this.caseModel.updateMany(
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

    await this.caseModel.updateMany(
      { deadlineCompensationClaimToken: batchClaimToken },
      {
        $set: {
          deadlineCompensationDispatchAt: nextCompensationDispatchAt,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
        },
      },
    );
    if (deliveries.length === GOVERNANCE_DEADLINE_BATCH_SIZE) {
      await this.enqueueCompensationContinuation();
    }
  }

  private async addCaseJobs(deliveries: GovernanceDeadlineDelivery[], now: Date): Promise<void> {
    await this.queue.addBulk(
      deliveries.map((delivery) => ({
        name: GOVERNANCE_DEADLINE_JOB_NAMES.ADVANCE_CASE,
        data: {
          kind: GOVERNANCE_DEADLINE_JOB_KINDS.ADVANCE_CASE,
          caseId: delivery._id.toString(),
          deadlineVersion: delivery.deadlineVersion,
          deliveryToken: delivery.deliveryToken,
        },
        opts: {
          jobId: getGovernanceDeadlineJobId(delivery.deliveryToken),
          delay: Math.max(0, delivery.nextTransitionAt.getTime() - now.getTime()),
          attempts: GOVERNANCE_DEADLINE_JOB_ATTEMPTS,
          priority: GOVERNANCE_DEADLINE_JOB_PRIORITY,
          deduplication: {
            id: getGovernanceDeadlineDeduplicationId(
              delivery._id.toString(),
              delivery.deadlineVersion,
            ),
          },
          backoff: {
            type: 'exponential',
            delay: GOVERNANCE_DEADLINE_JOB_BACKOFF_MS,
            jitter: GOVERNANCE_DEADLINE_JOB_BACKOFF_JITTER,
          },
          removeOnComplete: GOVERNANCE_DEADLINE_COMPLETED_RETENTION,
          removeOnFail: GOVERNANCE_DEADLINE_FAILED_RETENTION,
        },
      })),
    );
  }

  private async releaseScheduleClaims(batchClaimToken: string): Promise<void> {
    await this.caseModel.updateMany(
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
      GOVERNANCE_DEADLINE_JOB_NAMES.COMPENSATE,
      { kind: GOVERNANCE_DEADLINE_JOB_KINDS.COMPENSATE },
      {
        ...this.getSchedulerJobOptions(),
        deduplication: {
          id: GOVERNANCE_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
          keepLastIfActive: true,
        },
      },
    );
  }

  private getSchedulerJobOptions() {
    return {
      attempts: GOVERNANCE_DEADLINE_JOB_ATTEMPTS,
      priority: GOVERNANCE_DEADLINE_CONTROL_JOB_PRIORITY,
      backoff: {
        type: 'exponential' as const,
        delay: GOVERNANCE_DEADLINE_JOB_BACKOFF_MS,
        jitter: GOVERNANCE_DEADLINE_JOB_BACKOFF_JITTER,
      },
      removeOnComplete: GOVERNANCE_DEADLINE_COMPLETED_RETENTION,
      removeOnFail: GOVERNANCE_DEADLINE_FAILED_RETENTION,
    };
  }
}
