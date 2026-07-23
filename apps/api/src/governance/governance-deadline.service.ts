import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { DatabaseService } from '@/database/database.service';
import { ACTIVE_GOVERNANCE_CASE_STATUSES } from './governance.constants';
import {
  GOVERNANCE_DEADLINE_CLAIM_TTL_MS,
  GOVERNANCE_DEADLINE_COMPENSATION_RETRY_MS,
} from './governance-deadline.constants';
import { GovernanceService } from './governance.service';

@Injectable()
export class GovernanceDeadlineService {
  constructor(
    @InjectModel(GovernanceCase.name)
    private readonly caseModel: Model<GovernanceCase>,
    private readonly databaseService: DatabaseService,
    private readonly governanceService: GovernanceService,
  ) {}

  async processCase(caseId: string, deadlineVersion: number): Promise<boolean> {
    const now = new Date();
    const claimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + GOVERNANCE_DEADLINE_CLAIM_TTL_MS);
    const claimed = await this.caseModel.findOneAndUpdate(
      {
        _id: caseId,
        status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
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
        this.governanceService.advanceClaimedDeadline(
          caseId,
          deadlineVersion,
          claimToken,
          now,
          session,
        ),
      );
      if (!advanced) await this.releaseClaim(caseId, deadlineVersion, claimToken);
      return advanced;
    } catch (error) {
      await this.releaseClaim(caseId, deadlineVersion, claimToken);
      throw error;
    }
  }

  async releaseFailedDelivery(
    caseId: string,
    deadlineVersion: number,
    deliveryToken: string,
  ): Promise<void> {
    const nextCompensationDispatchAt = new Date(
      Date.now() + GOVERNANCE_DEADLINE_COMPENSATION_RETRY_MS,
    );
    await this.caseModel.updateOne(
      {
        _id: caseId,
        deadlineVersion,
        deadlineCompensationDeliveryToken: deliveryToken,
      },
      {
        $set: {
          deadlineCompensationDispatchAt: nextCompensationDispatchAt,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
        },
      },
    );
  }

  private async releaseClaim(
    caseId: string,
    deadlineVersion: number,
    claimToken: string,
  ): Promise<void> {
    await this.caseModel.updateOne(
      {
        _id: caseId,
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
