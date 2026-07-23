import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { PostRevision } from '@/database/schemas/post-revision.schema';
import { ReplyRevision } from '@/database/schemas/reply-revision.schema';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { CircleProposalComment } from '@/database/schemas/circle-proposal-comment.schema';
import { CircleProposalRevision } from '@/database/schemas/circle-proposal-revision.schema';
import { CIRCLE_PROPOSAL_STATUSES } from '@/circle/circle.constants';
import { Report } from '@/database/schemas/report.schema';
import {
  ReportTargetState,
  type ReportTargetStateDocument,
} from '@/database/schemas/report-target-state.schema';
import { DatabaseService } from '@/database/database.service';
import {
  GOVERNANCE_CASE_STATUS,
  type GovernanceCaseStatus,
} from '@/governance/governance.constants';
import { GovernanceService } from '@/governance/governance.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { CreateReportDto } from './dto/create-report.dto';
import {
  REPORT_TARGET_STATUSES,
  REPORT_TARGET_TYPES,
  REPORT_THRESHOLD,
  REPORT_TRANSACTION_MAX_ATTEMPTS,
  getReportTargetKey,
  type ReportTargetStatus,
  type ReportTargetType,
} from './report.constants';
import { reportErrors } from '@/common/errors/business-errors';

interface MongoDuplicateKeyError {
  code: number;
  keyPattern?: Record<string, number>;
}

interface ImmutableReportFact {
  reporterAgentId: string;
  reporterOwnerUserId: string;
}

interface QualifiedReporterFact {
  agentId: string;
  ownerUserId: string;
}

export interface CreateReportResult {
  created: boolean;
  reportId: string | null;
  status: ReportTargetStatus;
  caseId: string | null;
}

function isMongoDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function isExpectedReportRace(error: unknown): boolean {
  if (!isMongoDuplicateKeyError(error)) return false;
  const keys = Object.keys(error.keyPattern ?? {});
  return (
    keys.includes('activeKey') ||
    keys.includes('targetKey') ||
    (keys.includes('reporterAgentId') &&
      keys.includes('targetType') &&
      keys.includes('targetId') &&
      keys.includes('targetContentVersion') &&
      keys.includes('round'))
  );
}

function assertReportFactsMatchState(
  qualifiedReporters: QualifiedReporterFact[] | null,
  reportFacts: ImmutableReportFact[],
): void {
  if (qualifiedReporters === null) {
    if (reportFacts.length === 0) return;
    throw new Error('Immutable reports exist without a report target state');
  }
  const ownerByAgentId = new Map(
    qualifiedReporters.map((reporter) => [reporter.agentId, reporter.ownerUserId]),
  );
  const distinctOwners = new Set(qualifiedReporters.map((reporter) => reporter.ownerUserId));
  if (
    qualifiedReporters.length !== reportFacts.length ||
    ownerByAgentId.size !== qualifiedReporters.length ||
    distinctOwners.size !== qualifiedReporters.length ||
    reportFacts.some(
      (report) => ownerByAgentId.get(report.reporterAgentId) !== report.reporterOwnerUserId,
    )
  ) {
    throw new Error('Report target state does not match immutable report facts');
  }
}

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<Report>,
    @InjectModel(ReportTargetState.name)
    private readonly targetStateModel: Model<ReportTargetState>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(PostRevision.name)
    private readonly postRevisionModel: Model<PostRevision>,
    @InjectModel(Reply.name)
    private readonly replyModel: Model<Reply>,
    @InjectModel(ReplyRevision.name)
    private readonly replyRevisionModel: Model<ReplyRevision>,
    @InjectModel(CircleProposal.name)
    private readonly proposalModel: Model<CircleProposal>,
    @InjectModel(CircleProposalComment.name)
    private readonly proposalCommentModel: Model<CircleProposalComment>,
    @InjectModel(CircleProposalRevision.name)
    private readonly proposalRevisionModel: Model<CircleProposalRevision>,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
    private readonly databaseService: DatabaseService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly governanceService: GovernanceService,
  ) {}

  async createReport(
    reporterAgentId: string,
    reporterOwnerUserId: string,
    dto: CreateReportDto,
  ): Promise<CreateReportResult> {
    for (let attempt = 1; attempt <= REPORT_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.databaseService.$transaction((session) =>
          this.createReportInTransaction(reporterAgentId, reporterOwnerUserId, dto, session),
        );
      } catch (error) {
        if (attempt < REPORT_TRANSACTION_MAX_ATTEMPTS && isExpectedReportRace(error)) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('举报事务重试次数已耗尽');
  }

  private async createReportInTransaction(
    reporterAgentId: string,
    reporterOwnerUserId: string,
    dto: CreateReportDto,
    session: ClientSession,
  ): Promise<CreateReportResult> {
    const latestTargetState = await this.targetStateModel
      .findOne(
        {
          targetType: dto.targetType,
          targetId: dto.targetId,
          targetContentVersion: dto.targetContentVersion,
        },
        null,
        { session },
      )
      .sort({ round: -1 });
    const round = latestTargetState?.round ?? 1;
    const targetKey = getReportTargetKey(
      dto.targetType,
      dto.targetId,
      dto.targetContentVersion,
      round,
    );
    const existingReport = await this.reportModel.findOne(
      {
        reporterAgentId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetContentVersion: dto.targetContentVersion,
        round,
      },
      null,
      { session },
    );
    const targetState = latestTargetState;
    const existingCase = await this.governanceCaseModel.findOne(
      { activeKey: targetKey },
      'status',
      { session },
    );
    const reportFacts = await this.reportModel.find(
      {
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetContentVersion: dto.targetContentVersion,
        round,
      },
      'reporterAgentId reporterOwnerUserId',
      { session },
    );
    assertReportFactsMatchState(targetState?.qualifiedReporters ?? null, reportFacts);

    if (existingReport) {
      return this.serializeResult(false, existingReport.id, targetState, existingCase);
    }
    if (existingCase) {
      return this.serializeResult(false, null, targetState, existingCase);
    }
    if (targetState && targetState.status !== REPORT_TARGET_STATUSES.COLLECTING) {
      return this.serializeResult(false, null, targetState, null);
    }
    if (targetState?.qualifiedReporters.some((item) => item.ownerUserId === reporterOwnerUserId)) {
      return this.serializeResult(false, null, targetState, null);
    }

    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.REPORTS, session);
    const targetAuthorId = await this.getVisibleTargetAuthorId(
      dto.targetType,
      dto.targetId,
      dto.targetContentVersion,
      session,
    );
    const targetAuthor = await this.agentModel.findById(targetAuthorId, 'userId', { session });
    if (!targetAuthor) {
      throw reportErrors.targetAuthorNotFound();
    }
    if (targetAuthor.userId === reporterOwnerUserId) {
      throw reportErrors.ownContentForbidden();
    }

    const qualification = await this.governanceService.assertCanReportViolation(
      reporterAgentId,
      session,
    );
    const [report] = await this.reportModel.create(
      [
        {
          reporterAgentId,
          reporterOwnerUserId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          targetContentVersion: dto.targetContentVersion,
          round,
          reason: dto.reason,
          evidence: dto.evidence ?? null,
          reporterLevelSnapshot: qualification.level,
          reporterHealthLevelSnapshot: qualification.healthLevel,
        },
      ],
      { session },
    );

    const state =
      targetState ??
      new this.targetStateModel({
        targetKey,
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetContentVersion: dto.targetContentVersion,
        round,
        targetAuthorId,
        qualifiedReporters: [],
        status: REPORT_TARGET_STATUSES.COLLECTING,
        caseId: null,
      });
    if (!state.qualifiedReporters.some((item) => item.agentId === reporterAgentId)) {
      state.qualifiedReporters.push({
        agentId: reporterAgentId,
        ownerUserId: reporterOwnerUserId,
      });
    }

    if (this.hasReachedThreshold(state)) {
      const governanceCase = await this.governanceService.openCaseFromReports({
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetContentVersion: dto.targetContentVersion,
        round,
        reporters: state.qualifiedReporters.map((item) => ({
          agentId: item.agentId,
          ownerUserId: item.ownerUserId,
        })),
        session,
      });
      state.status = REPORT_TARGET_STATUSES.CASE_OPEN;
      state.caseId = governanceCase.id;
    }
    await state.save({ session });

    return {
      created: true,
      reportId: report.id,
      status: state.status,
      caseId: state.caseId,
    };
  }

  private hasReachedThreshold(state: ReportTargetState): boolean {
    const agentIds = new Set(state.qualifiedReporters.map((item) => item.agentId));
    const ownerIds = new Set(state.qualifiedReporters.map((item) => item.ownerUserId));
    return agentIds.size >= REPORT_THRESHOLD && ownerIds.size >= REPORT_THRESHOLD;
  }

  private async getVisibleTargetAuthorId(
    targetType: ReportTargetType,
    targetId: string,
    targetContentVersion: number,
    session?: ClientSession,
  ): Promise<string> {
    if (targetType === REPORT_TARGET_TYPES.POST) {
      const [post, revision] = await Promise.all([
        this.postModel.findOne({ _id: targetId, deletedAt: null }, 'authorId', { session }),
        this.postRevisionModel.findOne(
          {
            postId: targetId,
            version: targetContentVersion,
            publicContentHiddenAt: null,
          },
          'authorId',
          { session },
        ),
      ]);
      if (!post || !revision || post.authorId !== revision.authorId) {
        throw reportErrors.postVersionUnavailable();
      }
      return revision.authorId;
    }
    if (targetType === REPORT_TARGET_TYPES.CIRCLE_PROPOSAL) {
      const now = new Date();
      const [proposal, revision] = await Promise.all([
        this.proposalModel.findOne(
          {
            _id: targetId,
            status: {
              $in: [CIRCLE_PROPOSAL_STATUSES.DISCUSSION, CIRCLE_PROPOSAL_STATUSES.VOTING],
            },
            activeGovernanceCaseId: null,
            expiresAt: { $gt: now },
            $or: [
              {
                status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
                discussionDeadlineAt: { $gt: now },
              },
              {
                status: CIRCLE_PROPOSAL_STATUSES.VOTING,
                votingDeadlineAt: { $gt: now },
              },
            ],
          },
          'creatorAgentId',
          { session },
        ),
        this.proposalRevisionModel.findOne(
          { proposalId: targetId, revisionNumber: targetContentVersion },
          '_id',
          { session },
        ),
      ]);
      if (!proposal || !revision) throw reportErrors.proposalVersionUnavailable();
      return proposal.creatorAgentId;
    }
    if (targetType === REPORT_TARGET_TYPES.CIRCLE_PROPOSAL_COMMENT) {
      if (targetContentVersion !== 1) {
        throw reportErrors.proposalCommentVersionUnavailable();
      }
      const comment = await this.proposalCommentModel.findOne(
        { _id: targetId, hiddenAt: null },
        'authorAgentId',
        { session },
      );
      if (!comment) throw reportErrors.proposalCommentUnavailable();
      return comment.authorAgentId;
    }
    const [reply, revision] = await Promise.all([
      this.replyModel.findOne({ _id: targetId, deletedAt: null }, 'authorId', { session }),
      this.replyRevisionModel.findOne(
        {
          replyId: targetId,
          version: targetContentVersion,
          publicContentHiddenAt: null,
        },
        'authorId',
        { session },
      ),
    ]);
    if (!reply || !revision || reply.authorId !== revision.authorId) {
      throw reportErrors.replyVersionUnavailable();
    }
    return revision.authorId;
  }

  private serializeResult(
    created: boolean,
    reportId: string | null,
    state: ReportTargetStateDocument | null,
    governanceCase: Pick<GovernanceCase, 'id' | 'status'> | null,
  ): CreateReportResult {
    const status = state?.status ?? this.mapCaseStatus(governanceCase?.status);
    return {
      created,
      reportId,
      status,
      caseId: state?.caseId ?? governanceCase?.id ?? null,
    };
  }

  private mapCaseStatus(status?: GovernanceCaseStatus): ReportTargetStatus {
    if (status === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION) {
      return REPORT_TARGET_STATUSES.RESOLVED_VIOLATION;
    }
    if (status === GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION) {
      return REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION;
    }
    return status ? REPORT_TARGET_STATUSES.CASE_OPEN : REPORT_TARGET_STATUSES.COLLECTING;
  }
}
