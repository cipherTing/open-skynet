import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { DatabaseService } from '@/database/database.service';
import { ACTIVE_GOVERNANCE_CASE_STATUSES } from './governance.constants';
import {
  GOVERNANCE_DEADLINE_CLAIM_TTL_MS,
} from './governance-deadline.constants';
import { GovernanceService } from './governance.service';
import { getDeadlineRecoveryDelayMs } from '@/common/queue/deadline-recovery';
import { summarizeQueueFailureReason } from '@/common/queue/queue-event-log';

@Injectable()
export class GovernanceDeadlineService {
  private readonly logger = new Logger(GovernanceDeadlineService.name);

  constructor(
    @InjectModel(GovernanceCase.name)
    private readonly caseModel: Model<GovernanceCase>,
    private readonly databaseService: DatabaseService,
    private readonly governanceService: GovernanceService,
  ) {}

  async processCase(
    caseId: string,
    deadlineVersion: number,
    deliveryToken?: string,
  ): Promise<boolean> {
    const now = new Date();
    const claimToken = randomUUID();
    const claimExpiresAt = new Date(now.getTime() + GOVERNANCE_DEADLINE_CLAIM_TTL_MS);
    const claimed = await this.caseModel.findOneAndUpdate(
      {
        _id: caseId,
        status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
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
    error?: unknown,
  ): Promise<void> {
    const current = await this.caseModel
      .findOne({
        _id: caseId,
        deadlineVersion,
        deadlineCompensationDeliveryToken: deliveryToken,
      })
      .select('+deadlineRecoveryFailureCount')
      .lean<{ deadlineRecoveryFailureCount?: number }>();
    if (!current) return;
    const failureCount = (current.deadlineRecoveryFailureCount ?? 0) + 1;
    const nextCompensationDispatchAt = new Date(
      Date.now() + getDeadlineRecoveryDelayMs(failureCount),
    );
    const summary = summarizeQueueFailureReason(
      error instanceof Error ? error.message : String(error ?? 'UnknownError'),
    );
    await this.caseModel.updateOne(
      {
        _id: caseId,
        deadlineVersion,
        deadlineCompensationDeliveryToken: deliveryToken,
        deadlineRecoveryFailureCount: failureCount - 1,
      },
      {
        $set: {
          deadlineCompensationDispatchAt: nextCompensationDispatchAt,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
          deadlineRecoveryLastFailureAt: new Date(),
          deadlineRecoveryNextAttemptAt: nextCompensationDispatchAt,
          deadlineRecoveryReasonClass: summary.reasonClass,
          deadlineRecoveryReasonFingerprint: summary.fingerprint,
        },
        $inc: {
          deadlineRecoveryFailureCount: 1,
        },
      },
    );
    const message =
      `治理截止任务进入自动恢复 queue=governance-deadline caseId=${caseId} deadlineVersion=${deadlineVersion} failureCount=${failureCount} nextAttemptAt=${nextCompensationDispatchAt.toISOString()} reasonClass=${summary.reasonClass} reasonFingerprint=${summary.fingerprint}`;
    if (failureCount === 1) this.logger.error(message);
    else this.logger.warn(message);
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
