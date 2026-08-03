import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { DatabaseService } from '@/database/database.service';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import {
  ACTIVE_CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_PROPOSAL_DEADLINE_CLAIM_TTL_MS,
} from './circle-proposal-deadline.constants';
import { CircleProposalService } from './circle-proposal.service';
import { getDeadlineRecoveryDelayMs } from '@/common/queue/deadline-recovery';
import { summarizeQueueFailureReason } from '@/common/queue/queue-event-log';

@Injectable()
export class CircleProposalDeadlineService {
  private readonly logger = new Logger(CircleProposalDeadlineService.name);

  constructor(
    @InjectModel(CircleProposal.name)
    private readonly proposalModel: Model<CircleProposal>,
    private readonly databaseService: DatabaseService,
    private readonly proposalService: CircleProposalService,
  ) {}

  async processProposal(
    proposalId: string,
    deadlineVersion: number,
    deliveryToken?: string,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(proposalId)) {
      throw new Error(`共建提案截止任务包含无效提案 ID: ${proposalId}`);
    }
    const now = new Date();
    const claimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + CIRCLE_PROPOSAL_DEADLINE_CLAIM_TTL_MS);
    const claimed = await this.proposalModel.findOneAndUpdate(
      {
        _id: proposalId,
        status: { $in: ACTIVE_CIRCLE_PROPOSAL_STATUSES },
        activeGovernanceCaseId: null,
        deadlineVersion,
        nextTransitionAt: { $lte: now },
        ...(deliveryToken ? { deadlineCompensationDeliveryToken: deliveryToken } : {}),
        $or: [{ deadlineClaimExpiresAt: null }, { deadlineClaimExpiresAt: { $lte: now } }],
      },
      {
        $set: {
          deadlineClaimVersion: deadlineVersion,
          deadlineClaimToken: claimToken,
          deadlineClaimExpiresAt: claimExpiresAt,
        },
      },
      { new: true },
    );
    if (!claimed) return false;

    try {
      const advanced = await this.databaseService.$transaction((session) =>
        this.proposalService.advanceClaimedDeadline(
          proposalId,
          deadlineVersion,
          claimToken,
          now,
          session,
        ),
      );
      if (!advanced) await this.releaseClaim(proposalId, deadlineVersion, claimToken);
      return advanced;
    } catch (error) {
      await this.releaseClaim(proposalId, deadlineVersion, claimToken);
      throw error;
    }
  }

  async releaseFailedDelivery(
    proposalId: string,
    deadlineVersion: number,
    deliveryToken: string,
    error?: unknown,
  ): Promise<void> {
    const current = await this.proposalModel
      .findOne({
        _id: proposalId,
        deadlineVersion,
        deadlineCompensationDeliveryToken: deliveryToken,
      })
      .select('+deadlineRecoveryFailureCount')
      .lean<{ deadlineRecoveryFailureCount?: number }>();
    if (!current) return;
    const failureCount = (current.deadlineRecoveryFailureCount ?? 0) + 1;
    const nextAttemptAt = new Date(Date.now() + getDeadlineRecoveryDelayMs(failureCount));
    const summary = summarizeQueueFailureReason(
      error instanceof Error ? error.message : String(error ?? 'UnknownError'),
    );
    await this.proposalModel.updateOne(
      {
        _id: proposalId,
        deadlineVersion,
        deadlineCompensationDeliveryToken: deliveryToken,
        deadlineRecoveryFailureCount: failureCount - 1,
      },
      {
        $set: {
          deadlineCompensationDispatchAt: nextAttemptAt,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
          deadlineRecoveryLastFailureAt: new Date(),
          deadlineRecoveryNextAttemptAt: nextAttemptAt,
          deadlineRecoveryReasonClass: summary.reasonClass,
          deadlineRecoveryReasonFingerprint: summary.fingerprint,
        },
        $inc: {
          deadlineRecoveryFailureCount: 1,
        },
      },
    );
    const message =
      `共建提案截止任务进入自动恢复 queue=circle-proposal-deadline proposalId=${proposalId} deadlineVersion=${deadlineVersion} failureCount=${failureCount} nextAttemptAt=${nextAttemptAt.toISOString()} reasonClass=${summary.reasonClass} reasonFingerprint=${summary.fingerprint}`;
    if (failureCount === 1) this.logger.error(message);
    else this.logger.warn(message);
  }


  private async releaseClaim(
    proposalId: string,
    deadlineVersion: number,
    claimToken: string,
  ): Promise<void> {
    await this.proposalModel.updateOne(
      {
        _id: proposalId,
        deadlineVersion,
        deadlineClaimVersion: deadlineVersion,
        deadlineClaimToken: claimToken,
      },
      {
        $set: {
          deadlineClaimVersion: null,
          deadlineClaimToken: null,
          deadlineClaimExpiresAt: null,
        },
      },
    );
  }
}
