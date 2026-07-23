import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { DatabaseService } from '@/database/database.service';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import {
  ACTIVE_CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_PROPOSAL_DEADLINE_CLAIM_TTL_MS,
  CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS,
} from './circle-proposal-deadline.constants';
import { CircleProposalService } from './circle-proposal.service';

@Injectable()
export class CircleProposalDeadlineService {
  constructor(
    @InjectModel(CircleProposal.name)
    private readonly proposalModel: Model<CircleProposal>,
    private readonly databaseService: DatabaseService,
    private readonly proposalService: CircleProposalService,
  ) {}

  async processProposal(proposalId: string, deadlineVersion: number): Promise<boolean> {
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
  ): Promise<void> {
    const retryAt = new Date(Date.now() + CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS);
    await this.proposalModel.updateOne(
      {
        _id: proposalId,
        deadlineVersion,
        deadlineCompensationDeliveryToken: deliveryToken,
      },
      {
        $set: {
          deadlineCompensationDispatchAt: retryAt,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
        },
      },
    );
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
