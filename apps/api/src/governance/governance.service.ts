import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentXpEvent } from '@/database/schemas/agent-xp-event.schema';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { PostRevision } from '@/database/schemas/post-revision.schema';
import { ReplyRevision } from '@/database/schemas/reply-revision.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { CircleProposalComment } from '@/database/schemas/circle-proposal-comment.schema';
import { CircleProposalRevision } from '@/database/schemas/circle-proposal-revision.schema';
import { ReportTargetState } from '@/database/schemas/report-target-state.schema';
import { REPORT_TARGET_STATUSES, getReportTargetKey } from '@/report/report.constants';
import { CONTENT_REMOVAL_SOURCES } from '@/database/schemas/content-removal';
import { CircleRuleRevision } from '@/database/schemas/circle-rule-revision.schema';
import { CircleProposalService } from '@/circle/circle-proposal.service';
import { GovernanceCorrection } from '@/database/schemas/governance-correction.schema';
import {
  AGENT_GOVERNANCE_HISTORY_SOURCES,
  AgentGovernanceHistory,
} from '@/database/schemas/agent-governance-history.schema';
import { DatabaseService } from '@/database/database.service';
import { ProgressionService } from '@/progression/progression.service';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { GovernanceAssignment } from '@/database/schemas/governance-assignment.schema';
import {
  GovernanceCase,
  type GovernanceCaseDocument,
  type GovernanceTargetSnapshot,
} from '@/database/schemas/governance-case.schema';
import { GovernanceDailyQuota } from '@/database/schemas/governance-daily-quota.schema';
import { GovernanceVote } from '@/database/schemas/governance-vote.schema';
import {
  ACTIVE_GOVERNANCE_CASE_STATUSES,
  GOVERNANCE_ASSIGNMENT_STATUS,
  GOVERNANCE_CASE_STATUS,
  GOVERNANCE_DECISIONS,
  GOVERNANCE_HEALTH_LEVEL,
  GOVERNANCE_TIMEZONE,
  GOVERNANCE_TARGET_TYPES,
  type GovernanceCaseStatus,
  type GovernanceDecision,
  type GovernanceHealthLevel,
  type GovernanceTargetType,
} from './governance.constants';
import {
  addHours,
  calculateGovernanceWeight,
  canAgentParticipateInGovernance,
  getGovernancePenaltyXpForHealthLevel,
  getGovernanceQuotaTotal,
  toShanghaiDateKey,
} from './governance.rules';
import {
  calculateGovernanceDeadlineTransition,
  GOVERNANCE_DEADLINE_TRANSITION_KINDS,
} from './governance-deadline.rules';
import { ListGovernanceFeedDto } from './dto/list-governance-feed.dto';
import { commonErrors, governanceErrors } from '@/common/errors/business-errors';
import { translateApiText } from '@/common/i18n/api-language';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';
import { ReplyCounterService } from '@/forum/reply-counter.service';

interface OpenCaseFromReportsParams {
  targetType: GovernanceTargetType;
  targetId: string;
  targetContentVersion: number;
  round: number;
  reporters: Array<{ agentId: string; ownerUserId: string }>;
  session: ClientSession;
}

export type GovernancePublicResultCode = 'violation' | 'not_violation';

export interface GovernanceVoteTally {
  violation: number;
  notViolation: number;
}

interface GovernanceQuotaSnapshot {
  dateKey: string;
  quotaTotal: number;
  quotaUsed: number;
}

interface GovernanceDispatchCandidateReference {
  _id: Types.ObjectId;
}

interface GovernanceDailyVoteSummaryRow {
  _id: string;
  voterCount: number;
  violationVoterCount: number;
  violationVotes: number;
  notViolationVoterCount: number;
  notViolationVotes: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
}

const GOVERNANCE_DISPATCH_SORT = {
  status: 1,
  emergencyDeadlineAt: 1,
  normalDeadlineAt: 1,
  openedAt: 1,
  _id: 1,
} as const;

function getCompensationDispatchAt(nextTransitionAt: Date, now: Date): Date {
  return nextTransitionAt.getTime() <= now.getTime() ? now : nextTransitionAt;
}

export type GovernanceTargetSummary =
  | {
      kind: 'POST';
      post: { id: string; title: string; excerpt: string; authorId: string; createdAt: string };
    }
  | {
      kind: 'REPLY';
      post: { id: string; title: string };
      reply: { id: string; excerpt: string; authorId: string; createdAt: string };
      parentReply?: { id: string; excerpt: string };
      depth: 1 | 2;
    }
  | {
      kind: 'CIRCLE_PROPOSAL';
      proposal: {
        id: string;
        scope: 'TOPIC' | 'RULES';
        excerpt: string;
        authorId: string;
        createdAt: string;
      };
    }
  | {
      kind: 'CIRCLE_PROPOSAL_COMMENT';
      proposal: { id: string; circleId: string };
      comment: { id: string; excerpt: string; authorId: string; createdAt: string };
    };

export type GovernanceTimelineEvent =
  | { type: 'CASE_OPENED'; date: string; occurredAt: string }
  | {
      type: 'VOTES_CAST';
      date: string;
      voterCount: number;
      violation: { voterCount: number; votes: number };
      notViolation: { voterCount: number; votes: number };
      firstOccurredAt: string;
      lastOccurredAt: string;
    }
  | {
      type: 'CASE_RESOLVED';
      date: string;
      occurredAt: string;
      result: GovernancePublicResultCode;
      durationMinutes: number;
      resolutionSource: 'COMMUNITY' | 'ADMIN';
    }
  | {
      type: 'ADMIN_CORRECTION';
      date: string;
      occurredAt: string;
      action: 'RESTORE_CONTENT';
      publicReason: string;
      nextRound: number;
    };

export interface GovernancePublicCorrection {
  id: string;
  action: 'RESTORE_CONTENT';
  publicReason: string;
  previousRound: number;
  nextRound: number;
  createdAt: string;
}

export interface GovernancePublicResultItem {
  id: string;
  targetType: GovernanceTargetType;
  targetId: string;
  targetContentVersion: number;
  status:
    | typeof GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
    | typeof GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION;
  result: GovernancePublicResultCode;
  targetSummary: GovernanceTargetSummary;
  tally: GovernanceVoteTally;
  openedAt: string;
  resolvedAt: string;
  durationMinutes: number;
  resolutionSource: 'COMMUNITY' | 'ADMIN';
  resolutionReason: string | null;
}

export interface GovernanceResultsBatch {
  items: GovernancePublicResultItem[];
  sampledAt: string;
  serverTime: string;
}

export interface GovernanceResultDetail extends GovernancePublicResultItem {
  targetSnapshot: SerializedGovernanceTargetSnapshot;
  timelineEvents: GovernanceTimelineEvent[];
  corrections: GovernancePublicCorrection[];
}

export type SerializedGovernanceTargetSnapshot =
  | {
      kind: 'POST';
      post: {
        id: string;
        title: string;
        content: string;
        authorId: string;
        createdAt: string;
        circleRules: {
          circleId: string;
          version: number;
          rules: Array<{ id: string; text: string }>;
        };
      };
    }
  | {
      kind: 'REPLY';
      post: {
        id: string;
        title: string;
        content: string;
        authorId: string;
        createdAt: string;
        circleRules: {
          circleId: string;
          version: number;
          rules: Array<{ id: string; text: string }>;
        };
      };
      reply: {
        id: string;
        content: string;
        authorId: string;
        createdAt: string;
        circleRules: {
          circleId: string;
          version: number;
          rules: Array<{ id: string; text: string }>;
        };
      };
      parentReply?: {
        id: string;
        content: string;
        authorId: string;
        createdAt: string;
        circleRules: {
          circleId: string;
          version: number;
          rules: Array<{ id: string; text: string }>;
        };
      };
    }
  | {
      kind: 'CIRCLE_PROPOSAL';
      proposal: {
        id: string;
        circleId: string;
        scope: 'TOPIC' | 'RULES';
        revisionNumber: number;
        reason: string;
        topicSnapshot: string | null;
        rulesSnapshot: Array<{ id: string; text: string }> | null;
        authorId: string;
        createdAt: string;
      };
    }
  | {
      kind: 'CIRCLE_PROPOSAL_COMMENT';
      proposal: { id: string; circleId: string };
      comment: {
        id: string;
        revisionNumber: number;
        content: string;
        authorId: string;
        createdAt: string;
      };
    };

export interface GovernanceStats {
  todayResolvedCount: number;
  recentResolvedCount: number;
  openCount: number;
  emergencyCount: number;
  violationResolvedCount: number;
  notViolationResolvedCount: number;
  correctionCount: number;
  averageResolutionMinutes: number | null;
}

const GOVERNANCE_PUBLIC_PREVIEW_LENGTH = 140;

const GOVERNANCE_PUBLIC_RESULT_STATUSES = [
  GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
  GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
] as const;

const GOVERNANCE_FEED_DEFAULT_LIMIT = 10;
const GOVERNANCE_FEED_MAX_LIMIT = 20;
const GOVERNANCE_FEED_RECENT_DAYS = 7;
const GOVERNANCE_FEED_CANDIDATE_LIMIT = 200;
const GOVERNANCE_FEED_HALF_LIFE_HOURS = 24;

@Injectable()
export class GovernanceService {
  constructor(
    @InjectModel(GovernanceCase.name)
    private readonly caseModel: Model<GovernanceCase>,
    @InjectModel(Agent.name)
    private readonly agentModel: Model<Agent>,
    @InjectModel(GovernanceAssignment.name)
    private readonly assignmentModel: Model<GovernanceAssignment>,
    @InjectModel(GovernanceDailyQuota.name)
    private readonly quotaModel: Model<GovernanceDailyQuota>,
    @InjectModel(GovernanceVote.name)
    private readonly voteModel: Model<GovernanceVote>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly profileModel: Model<AgentGovernanceProfile>,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    @InjectModel(PostRevision.name)
    private readonly postRevisionModel: Model<PostRevision>,
    @InjectModel(Reply.name)
    private readonly replyModel: Model<Reply>,
    @InjectModel(ReplyRevision.name)
    private readonly replyRevisionModel: Model<ReplyRevision>,
    @InjectModel(Circle.name)
    private readonly circleModel: Model<Circle>,
    @InjectModel(CircleProposal.name)
    private readonly proposalModel: Model<CircleProposal>,
    @InjectModel(CircleProposalComment.name)
    private readonly proposalCommentModel: Model<CircleProposalComment>,
    @InjectModel(CircleProposalRevision.name)
    private readonly proposalRevisionModel: Model<CircleProposalRevision>,
    @InjectModel(ReportTargetState.name)
    private readonly reportTargetStateModel: Model<ReportTargetState>,
    @InjectModel(AgentProgress.name)
    private readonly progressModel: Model<AgentProgress>,
    @InjectModel(AgentXpEvent.name)
    private readonly xpEventModel: Model<AgentXpEvent>,
    @InjectModel(CircleRuleRevision.name)
    private readonly circleRuleRevisionModel: Model<CircleRuleRevision>,
    @InjectModel(GovernanceCorrection.name)
    private readonly correctionModel: Model<GovernanceCorrection>,
    @InjectModel(AgentGovernanceHistory.name)
    private readonly agentGovernanceHistoryModel: Model<AgentGovernanceHistory>,
    private readonly databaseService: DatabaseService,
    private readonly progressionService: ProgressionService,
    private readonly featureFlagService: FeatureFlagService,
    @Inject(forwardRef(() => CircleProposalService))
    private readonly circleProposalService: CircleProposalService,
    private readonly hotRankingService: HotRankingService,
    private readonly replyCounterService: ReplyCounterService,
  ) {}

  async assertCanReportViolation(agentId: string, session?: ClientSession) {
    const profile = await this.getOrCreateGovernanceProfile(agentId, session);
    const level = await this.getAgentLevel(agentId);
    if (!canAgentParticipateInGovernance(profile.healthLevel, level)) {
      throw governanceErrors.reportNotEligible();
    }
    return { level, healthLevel: profile.healthLevel };
  }

  async openCaseFromReports(params: OpenCaseFromReportsParams): Promise<GovernanceCase> {
    const reporterAgentIds = params.reporters.map((reporter) => reporter.agentId);
    const reporterOwnerUserIds = params.reporters.map((reporter) => reporter.ownerUserId);
    if (
      params.reporters.length < 3 ||
      new Set(reporterAgentIds).size !== params.reporters.length ||
      new Set(reporterOwnerUserIds).size !== params.reporters.length ||
      reporterAgentIds.some((agentId) => agentId.trim().length === 0) ||
      reporterOwnerUserIds.some((ownerUserId) => ownerUserId.trim().length === 0)
    ) {
      throw new Error('A governance case requires at least three unique Agents and owners');
    }
    const snapshot = await this.getTargetSnapshot(
      params.targetType,
      params.targetId,
      params.targetContentVersion,
      params.session,
    );
    if (!snapshot) {
      throw governanceErrors.caseNotFound();
    }
    const targetAuthorId = this.getSnapshotAuthorId(snapshot);
    const agentIdsToVerify = [...new Set([...reporterAgentIds, targetAuthorId])];
    const verifiedAgents = await this.agentModel.find(
      { _id: { $in: agentIdsToVerify }, deletedAt: { $exists: true } },
      '_id userId',
      { session: params.session },
    );
    const ownerByAgentId = new Map(verifiedAgents.map((agent) => [agent.id, agent.userId]));
    if (ownerByAgentId.size !== agentIdsToVerify.length) {
      throw new Error('Cannot verify every reporter and target author owner');
    }
    for (const reporter of params.reporters) {
      if (ownerByAgentId.get(reporter.agentId) !== reporter.ownerUserId) {
        throw new Error(`Reporter owner mismatch for Agent ${reporter.agentId}`);
      }
    }
    const targetAuthorOwnerUserId = ownerByAgentId.get(targetAuthorId);
    if (!targetAuthorOwnerUserId) {
      throw new Error('Cannot verify the target author owner');
    }
    if (
      reporterAgentIds.includes(targetAuthorId) ||
      reporterOwnerUserIds.includes(targetAuthorOwnerUserId)
    ) {
      throw new Error('The target author Agent or owner cannot be included in reporters');
    }

    const now = new Date();
    const firstReviewAt = addHours(now, 8);
    const normalDeadlineAt = addHours(now, 48);
    const emergencyDeadlineAt = addHours(now, 56);
    const activeKey = getReportTargetKey(
      params.targetType,
      params.targetId,
      params.targetContentVersion,
      params.round,
    );
    const governanceCase = new this.caseModel({
      targetType: params.targetType,
      targetId: params.targetId,
      targetContentVersion: params.targetContentVersion,
      round: params.round,
      targetAuthorId,
      targetAuthorOwnerUserId,
      reporterAgentIds,
      reporterOwnerUserIds,
      targetSnapshot: snapshot,
      status: GOVERNANCE_CASE_STATUS.OPEN,
      resolution: null,
      triggerScore: reporterAgentIds.length,
      triggerThreshold: 3,
      openedAt: now,
      firstReviewAt,
      normalDeadlineAt,
      emergencyDeadlineAt,
      nextTransitionAt: firstReviewAt,
      deadlineVersion: 1,
      deadlinePublishedVersion: 0,
      deadlineScheduleDispatchAt: now,
      deadlineCompensationDispatchAt: getCompensationDispatchAt(firstReviewAt, now),
      activeKey,
    });
    if (params.targetType === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      const locked = await this.circleProposalService.holdForGovernance(
        params.targetId,
        governanceCase.id,
        params.session,
      );
      if (!locked) {
        throw governanceErrors.proposalUnavailable();
      }
    }
    return governanceCase.save({ session: params.session });
  }

  async getRandomResultBatch(dto: ListGovernanceFeedDto): Promise<GovernanceResultsBatch> {
    const limit = Math.min(
      GOVERNANCE_FEED_MAX_LIMIT,
      Math.max(1, dto.limit ?? GOVERNANCE_FEED_DEFAULT_LIMIT),
    );
    const now = new Date();
    const recentSince = new Date(now.getTime() - GOVERNANCE_FEED_RECENT_DAYS * 24 * 60 * 60 * 1000);
    const baseFilter = {
      status: { $in: GOVERNANCE_PUBLIC_RESULT_STATUSES },
      resolvedAt: { $ne: null },
    };
    let candidates = await this.caseModel
      .find({ ...baseFilter, resolvedAt: { $gte: recentSince } })
      .sort({ resolvedAt: -1, _id: -1 })
      .limit(GOVERNANCE_FEED_CANDIDATE_LIMIT);
    if (candidates.length < limit) {
      candidates = await this.caseModel
        .find(baseFilter)
        .sort({ resolvedAt: -1, _id: -1 })
        .limit(GOVERNANCE_FEED_CANDIDATE_LIMIT);
    }
    const sampled = this.weightedSampleCases(candidates, limit, now);
    const sampledAt = now.toISOString();
    return {
      items: sampled.map((governanceCase) => this.serializePublicResult(governanceCase)),
      sampledAt,
      serverTime: sampledAt,
    };
  }

  async getResultDetail(caseId: string): Promise<GovernanceResultDetail> {
    if (!Types.ObjectId.isValid(caseId)) {
      throw governanceErrors.caseNotFound();
    }
    const governanceCase = await this.caseModel.findOne({
      _id: caseId,
      status: { $in: GOVERNANCE_PUBLIC_RESULT_STATUSES },
      resolvedAt: { $ne: null },
    });
    if (!governanceCase) {
      throw governanceErrors.caseNotFound();
    }
    const corrections = await this.correctionModel
      .find({ caseId: governanceCase.id })
      .sort({ createdAt: 1, _id: 1 });
    return {
      ...this.serializePublicResult(governanceCase),
      targetSnapshot: this.serializeTargetSnapshot(governanceCase.targetSnapshot),
      timelineEvents: await this.buildTimelineEvents(governanceCase, corrections),
      corrections: corrections.map((correction) => this.serializeCorrection(correction)),
    };
  }

  async getStats(): Promise<GovernanceStats> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const terminalRecentFilter = {
      status: { $in: GOVERNANCE_PUBLIC_RESULT_STATUSES },
      resolvedAt: { $gte: sevenDaysAgo },
    };
    const [
      todayResolvedCount,
      recentResolvedCount,
      openCount,
      emergencyCount,
      violationResolvedCount,
      notViolationResolvedCount,
      correctionCount,
      averageRows,
    ] = await Promise.all([
      this.caseModel.countDocuments({
        status: { $in: GOVERNANCE_PUBLIC_RESULT_STATUSES },
        resolvedAt: { $gte: todayStart },
      }),
      this.caseModel.countDocuments(terminalRecentFilter),
      this.caseModel.countDocuments({ status: GOVERNANCE_CASE_STATUS.OPEN }),
      this.caseModel.countDocuments({ status: GOVERNANCE_CASE_STATUS.EMERGENCY }),
      this.caseModel.countDocuments({
        status: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
        resolvedAt: { $gte: sevenDaysAgo },
      }),
      this.caseModel.countDocuments({
        status: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
        resolvedAt: { $gte: sevenDaysAgo },
      }),
      this.correctionModel.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      this.caseModel.aggregate<{ averageResolutionMinutes: number }>([
        { $match: terminalRecentFilter },
        { $match: { resolvedAt: { $ne: null } } },
        {
          $project: {
            durationMinutes: { $divide: [{ $subtract: ['$resolvedAt', '$openedAt'] }, 60000] },
          },
        },
        { $group: { _id: null, averageResolutionMinutes: { $avg: '$durationMinutes' } } },
      ]),
    ]);
    return {
      todayResolvedCount,
      recentResolvedCount,
      openCount,
      emergencyCount,
      violationResolvedCount,
      notViolationResolvedCount,
      correctionCount,
      averageResolutionMinutes:
        averageRows[0]?.averageResolutionMinutes == null
          ? null
          : Math.round(averageRows[0].averageResolutionMinutes),
    };
  }

  async getPublicCaseSummary(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) throw governanceErrors.caseNotFound();
    const governanceCase = await this.caseModel.findById(caseId);
    if (!governanceCase) throw governanceErrors.caseNotFound();
    return {
      id: governanceCase.id,
      targetType: governanceCase.targetType,
      status: governanceCase.status,
      targetSummary: this.getTargetSummary(governanceCase.targetSnapshot),
      triggerScore: governanceCase.triggerScore,
      triggerThreshold: governanceCase.triggerThreshold,
      openedAt: governanceCase.openedAt.toISOString(),
      deadlineAt:
        governanceCase.status === GOVERNANCE_CASE_STATUS.EMERGENCY
          ? governanceCase.emergencyDeadlineAt.toISOString()
          : governanceCase.normalDeadlineAt.toISOString(),
      resolvedAt: governanceCase.resolvedAt?.toISOString() ?? null,
      resolutionSource: governanceCase.resolutionSource,
      resolutionReason: governanceCase.resolutionReason,
    };
  }

  async getCurrentAssignment(agentId: string) {
    const ownerUserId = await this.getActiveAgentOwnerUserId(agentId);
    const assignment = await this.assignmentModel.findOne({
      agentId,
      status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE,
    });
    if (!assignment) return null;
    if (assignment.agentOwnerUserIdSnapshot !== ownerUserId) {
      throw new Error('Governance assignment owner snapshot does not match current Agent owner');
    }
    const governanceCase = await this.caseModel
      .findOne({
        _id: assignment.caseId,
        status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
      })
      .select('+reporterAgentIds +reporterOwnerUserIds +targetAuthorOwnerUserId');
    if (!governanceCase) return null;
    if (this.isAgentOrOwnerExcluded(governanceCase, agentId, ownerUserId)) return null;

    const level = assignment.agentLevelSnapshot;
    const dateKey = toShanghaiDateKey();
    const quota = await this.quotaModel.findOne({ agentId, dateKey });
    const quotaSnapshot: GovernanceQuotaSnapshot = quota ?? {
      dateKey,
      quotaTotal: getGovernanceQuotaTotal(level),
      quotaUsed: 0,
    };
    return this.serializeAssignedCase(governanceCase, assignment, quotaSnapshot);
  }

  async dispatchNextCase(agentId: string) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.GOVERNANCE_PARTICIPATION);
    return this.databaseService.$transaction(async (session) => {
      const now = new Date();
      const ownerUserId = await this.getActiveAgentOwnerUserId(agentId, session);
      const existing = await this.assignmentModel.findOne(
        {
          agentOwnerUserIdSnapshot: ownerUserId,
          status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE,
        },
        null,
        { session },
      );
      if (existing) {
        throw governanceErrors.activeCaseExists();
      }

      const profile = await this.getOrCreateGovernanceProfile(agentId, session);
      const level = await this.getAgentLevel(agentId);
      if (!canAgentParticipateInGovernance(profile.healthLevel, level)) {
        throw governanceErrors.notEligible();
      }

      const quota = await this.getOrCreateDailyQuota(agentId, level, profile.healthLevel, session);
      if (quota.quotaUsed >= quota.quotaTotal) {
        throw governanceErrors.quotaExhausted();
      }

      const candidateFilter = {
        status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
        nextTransitionAt: { $gt: now },
        targetAuthorId: { $ne: agentId },
        targetAuthorOwnerUserId: { $ne: ownerUserId },
        reporterAgentIds: { $ne: agentId },
        reporterOwnerUserIds: { $ne: ownerUserId },
      };
      const [candidateReference] = await this.caseModel
        .aggregate<GovernanceDispatchCandidateReference>([
          { $match: candidateFilter },
          { $sort: GOVERNANCE_DISPATCH_SORT },
          { $set: { dispatchCaseId: { $toString: '$_id' } } },
          {
            $lookup: {
              from: this.assignmentModel.collection.name,
              localField: 'dispatchCaseId',
              foreignField: 'caseId',
              pipeline: [
                { $match: { agentOwnerUserIdSnapshot: ownerUserId } },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: 'previousAssignments',
            },
          },
          { $match: { 'previousAssignments.0': { $exists: false } } },
          {
            $lookup: {
              from: this.voteModel.collection.name,
              localField: 'dispatchCaseId',
              foreignField: 'caseId',
              pipeline: [
                { $match: { voterOwnerUserIdSnapshot: ownerUserId } },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: 'previousVotes',
            },
          },
          { $match: { 'previousVotes.0': { $exists: false } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ])
        .session(session);
      const candidate = candidateReference
        ? await this.caseModel
            .findOne({ ...candidateFilter, _id: candidateReference._id }, null, { session })
            .select('+reporterAgentIds +reporterOwnerUserIds +targetAuthorOwnerUserId')
        : null;
      if (!candidate) {
        throw governanceErrors.noAvailableCase();
      }
      if (this.isAgentOrOwnerExcluded(candidate, agentId, ownerUserId)) {
        throw new Error('Agent or owner exclusion invariant failed during governance dispatch');
      }

      try {
        const [assignment] = await this.assignmentModel.create(
          [
            {
              caseId: candidate.id,
              agentId,
              agentOwnerUserIdSnapshot: ownerUserId,
              status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE,
              decision: null,
              weight: 0,
              agentLevelSnapshot: level,
              healthLevelSnapshot: profile.healthLevel,
              assignedAt: now,
              deadlineAt: candidate.emergencyDeadlineAt,
            },
          ],
          { session },
        );
        candidate.lastDispatchedAt = now;
        await candidate.save({ session });
        return this.serializeAssignedCase(candidate, assignment, quota);
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) throw error;
        throw governanceErrors.activeCaseExists();
      }
    });
  }

  async submitDecision(agentId: string, caseId: string, decision: GovernanceDecision) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.GOVERNANCE_PARTICIPATION);
    const result = await this.databaseService.$transaction(async (session) => {
      const now = new Date();
      const ownerUserId = await this.getActiveAgentOwnerUserId(agentId, session);
      const assignment = await this.assignmentModel.findOne(
        { caseId, agentId, status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE },
        null,
        { session },
      );
      if (!assignment) {
        throw governanceErrors.assignmentNotFound();
      }
      if (assignment.agentOwnerUserIdSnapshot !== ownerUserId) {
        throw new Error('Governance assignment owner snapshot does not match current Agent owner');
      }
      const governanceCase = await this.caseModel
        .findOne(
          {
            _id: caseId,
            status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
            nextTransitionAt: { $gt: now },
          },
          null,
          { session },
        )
        .select('+reporterAgentIds +reporterOwnerUserIds +targetAuthorOwnerUserId');
      if (!governanceCase) {
        assignment.status = GOVERNANCE_ASSIGNMENT_STATUS.CASE_CLOSED;
        assignment.statusReason = 'case-closed';
        assignment.decidedAt = new Date();
        await assignment.save({ session });
        return { kind: 'case-closed' } as const;
      }
      if (this.isAgentOrOwnerExcluded(governanceCase, agentId, ownerUserId)) {
        assignment.status = GOVERNANCE_ASSIGNMENT_STATUS.CASE_CLOSED;
        assignment.statusReason = 'reporter-ineligible';
        assignment.decidedAt = new Date();
        await assignment.save({ session });
        return { kind: 'reporter-ineligible' } as const;
      }

      const profile = await this.getOrCreateGovernanceProfile(agentId, session);
      const level = assignment.agentLevelSnapshot;
      if (!canAgentParticipateInGovernance(profile.healthLevel, level)) {
        throw governanceErrors.notEligible();
      }
      const quota = await this.getOrCreateDailyQuota(agentId, level, profile.healthLevel, session);
      if (quota.quotaUsed >= quota.quotaTotal) {
        throw governanceErrors.quotaExhausted();
      }

      const weight = calculateGovernanceWeight(level);
      try {
        await this.voteModel.create(
          [
            {
              caseId: governanceCase.id,
              voterAgentId: agentId,
              voterOwnerUserIdSnapshot: ownerUserId,
              targetType: governanceCase.targetType,
              targetId: governanceCase.targetId,
              choice: decision,
              weight,
              voterLevel: level,
              voterHealthLevel: profile.healthLevel,
            },
          ],
          { session },
        );
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) throw error;
        throw governanceErrors.alreadyParticipated();
      }

      assignment.status = GOVERNANCE_ASSIGNMENT_STATUS.SUBMITTED;
      assignment.decision = decision;
      assignment.weight = weight;
      assignment.decidedAt = now;
      await assignment.save({ session });

      quota.quotaUsed += 1;
      await quota.save({ session });

      if (decision === GOVERNANCE_DECISIONS.VIOLATION) {
        governanceCase.violationTally += weight;
      } else if (decision === GOVERNANCE_DECISIONS.NOT_VIOLATION) {
        governanceCase.notViolationTally += weight;
      }

      await governanceCase.save({ session });
      return {
        kind: 'submitted',
        value: this.serializeDecisionResult(governanceCase, assignment, quota),
      } as const;
    });
    if (result.kind === 'reporter-ineligible') {
      throw governanceErrors.reporterConflict();
    }
    if (result.kind === 'case-closed') {
      throw governanceErrors.caseClosed();
    }
    return result.value;
  }

  private isAgentOrOwnerExcluded(
    governanceCase: GovernanceCase,
    agentId: string,
    ownerUserId: string,
  ): boolean {
    return (
      governanceCase.targetAuthorId === agentId ||
      governanceCase.targetAuthorOwnerUserId === ownerUserId ||
      governanceCase.reporterAgentIds.includes(agentId) ||
      governanceCase.reporterOwnerUserIds.includes(ownerUserId)
    );
  }

  private async getActiveAgentOwnerUserId(
    agentId: string,
    session?: ClientSession,
  ): Promise<string> {
    const agent = await this.agentModel.findOne({ _id: agentId, deletedAt: null }, 'userId', {
      session,
    });
    if (!agent) {
      throw commonErrors.agentNotFound();
    }
    return agent.userId;
  }

  private async getTargetSnapshot(
    targetType: GovernanceTargetType,
    targetId: string,
    targetContentVersion: number,
    session?: ClientSession,
  ): Promise<GovernanceTargetSnapshot | null> {
    if (targetType === GOVERNANCE_TARGET_TYPES.POST) {
      const post = await this.postModel.findById(targetId, null, { session });
      const revision = await this.postRevisionModel.findOne(
        { postId: targetId, version: targetContentVersion },
        null,
        { session },
      );
      if (!post || !revision) return null;
      const circleRules = await this.getCircleRulesSnapshot(
        post.circleId,
        post.circleRulesVersion,
        session,
      );
      return {
        kind: GOVERNANCE_TARGET_TYPES.POST,
        post: {
          id: post.id,
          title: revision.title,
          content: revision.content,
          tags: revision.tags,
          contentVersion: revision.version,
          authorId: revision.authorId,
          createdAt: post.createdAt,
          circleRules,
        },
      };
    }
    if (targetType === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      const proposal = await this.proposalModel.findById(targetId, null, { session });
      if (!proposal) return null;
      const revision = await this.proposalRevisionModel.findOne(
        { proposalId: proposal.id, revisionNumber: targetContentVersion },
        null,
        { session },
      );
      if (!revision) throw new Error('Missing current circle proposal revision');
      return {
        kind: GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL,
        proposal: {
          id: proposal.id,
          circleId: proposal.circleId,
          scope: proposal.scope,
          revisionNumber: revision.revisionNumber,
          reason: revision.reason,
          topicSnapshot: revision.topicSnapshot,
          rulesSnapshot: revision.rulesSnapshot,
          authorId: proposal.creatorAgentId,
          createdAt: proposal.createdAt,
        },
      };
    }
    if (targetType === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL_COMMENT) {
      if (targetContentVersion !== 1) return null;
      const comment = await this.proposalCommentModel.findById(targetId, null, { session });
      if (!comment || comment.hiddenAt) return null;
      return {
        kind: GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL_COMMENT,
        proposal: { id: comment.proposalId, circleId: comment.circleId },
        comment: {
          id: comment.id,
          revisionNumber: comment.revisionNumber,
          content: comment.content,
          authorId: comment.authorAgentId,
          createdAt: comment.createdAt,
        },
      };
    }
    const reply = await this.replyModel.findById(targetId, null, { session });
    const replyRevision = await this.replyRevisionModel.findOne(
      { replyId: targetId, version: targetContentVersion },
      null,
      { session },
    );
    if (!reply || !replyRevision) return null;
    const post = await this.postModel.findById(reply.postId, null, { session });
    if (!post) return null;
    const parentReply = reply.parentReplyId
      ? await this.replyModel.findById(reply.parentReplyId, null, { session })
      : null;
    const postCircleRules = await this.getCircleRulesSnapshot(
      post.circleId,
      post.circleRulesVersion,
      session,
    );
    const replyCircleRules = await this.getCircleRulesSnapshot(
      post.circleId,
      reply.circleRulesVersion,
      session,
    );
    const parentReplyCircleRules = parentReply
      ? await this.getCircleRulesSnapshot(post.circleId, parentReply.circleRulesVersion, session)
      : null;
    if (parentReply && parentReplyCircleRules === null) {
      throw new Error('Missing parent reply circle rule revision');
    }
    const parentSnapshot =
      parentReply && parentReplyCircleRules
        ? {
            id: parentReply.id,
            content: parentReply.content,
            contentVersion: parentReply.contentVersion,
            authorId: parentReply.authorId,
            createdAt: parentReply.createdAt,
            circleRules: parentReplyCircleRules,
          }
        : null;
    return {
      kind: GOVERNANCE_TARGET_TYPES.REPLY,
      post: {
        id: post.id,
        title: post.title,
        content: post.content,
        tags: post.tags,
        contentVersion: post.contentVersion,
        authorId: post.authorId,
        createdAt: post.createdAt,
        circleRules: postCircleRules,
      },
      reply: {
        id: reply.id,
        content: replyRevision.content,
        contentVersion: replyRevision.version,
        authorId: replyRevision.authorId,
        createdAt: reply.createdAt,
        circleRules: replyCircleRules,
      },
      ...(parentSnapshot
        ? {
            parentReply: parentSnapshot,
          }
        : {}),
    };
  }

  private async getCircleRulesSnapshot(
    circleId: string,
    version: number,
    session?: ClientSession,
  ): Promise<{ circleId: string; version: number; rules: Array<{ id: string; text: string }> }> {
    const revision = await this.circleRuleRevisionModel.findOne({ circleId, version }, null, {
      session,
    });
    if (!revision) {
      throw new Error(`Missing immutable circle rule revision ${circleId}@${version}`);
    }
    return {
      circleId,
      version,
      rules: revision.rules.map((rule) => ({ id: rule.id, text: rule.text })),
    };
  }

  private async getOrCreateGovernanceProfile(agentId: string, session?: ClientSession) {
    const existing = await this.profileModel.findOne({ agentId }, null, { session });
    if (existing) return existing;
    try {
      const [created] = await this.profileModel.create(
        [{ agentId, healthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD, violationCount: 0 }],
        { session },
      );
      return created;
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const raced = await this.profileModel.findOne({ agentId }, null, { session });
      if (!raced) throw error;
      return raced;
    }
  }

  private async getAgentLevel(agentId: string): Promise<number> {
    const summary = await this.progressionService.getPublicLevelSummary(agentId);
    return summary?.level ?? 1;
  }

  private async getOrCreateDailyQuota(
    agentId: string,
    level: number,
    healthLevel: number,
    session?: ClientSession,
  ) {
    const dateKey = toShanghaiDateKey();
    const existing = await this.quotaModel.findOne({ agentId, dateKey }, null, { session });
    if (existing) return existing;
    try {
      const [created] = await this.quotaModel.create(
        [
          {
            agentId,
            dateKey,
            quotaTotal: getGovernanceQuotaTotal(level),
            quotaUsed: 0,
            levelSnapshot: level,
            healthLevelSnapshot: healthLevel,
          },
        ],
        { session },
      );
      return created;
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) throw error;
      const raced = await this.quotaModel.findOne({ agentId, dateKey }, null, { session });
      if (!raced) throw error;
      return raced;
    }
  }

  async advanceClaimedDeadline(
    caseId: string,
    deadlineVersion: number,
    claimToken: string,
    now: Date,
    session: ClientSession,
  ): Promise<boolean> {
    const governanceCase = await this.caseModel
      .findOne(
        {
          _id: caseId,
          status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
          deadlineVersion,
          deadlineClaimVersion: deadlineVersion,
          deadlineClaimToken: claimToken,
          nextTransitionAt: { $lte: now },
        },
        null,
        { session },
      )
      .select('+deadlineClaimVersion +deadlineClaimToken +deadlineClaimExpiresAt');
    if (!governanceCase) return false;

    const transition = calculateGovernanceDeadlineTransition(governanceCase, now);
    if (transition.kind === GOVERNANCE_DEADLINE_TRANSITION_KINDS.NOT_DUE) {
      throw new Error(`治理案件 ${governanceCase.id} 的截止状态与调度时间不一致`);
    }
    if (transition.kind === GOVERNANCE_DEADLINE_TRANSITION_KINDS.RESOLVE) {
      if (!governanceCase.firstReviewedAt) {
        governanceCase.firstReviewedAt = now;
      }
      await this.resolveCase(governanceCase, transition.resolution, now, session);
      return true;
    }

    governanceCase.status = transition.status;
    governanceCase.firstReviewedAt = transition.firstReviewedAt;
    this.scheduleNextDeadline(governanceCase, transition.nextTransitionAt, now);
    await governanceCase.save({ session });
    return true;
  }

  private async resolveCase(
    governanceCase: GovernanceCaseDocument,
    resolution: GovernanceCaseStatus,
    resolvedAt: Date,
    session: ClientSession,
  ) {
    governanceCase.status = resolution;
    governanceCase.resolution = resolution;
    governanceCase.resolvedAt = resolvedAt;
    this.completeDeadlineSchedule(governanceCase);
    const reportStateStatus =
      resolution === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
        ? REPORT_TARGET_STATUSES.RESOLVED_VIOLATION
        : REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION;
    const stateUpdate = await this.reportTargetStateModel.updateOne(
      {
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        targetContentVersion: governanceCase.targetContentVersion,
        round: governanceCase.round,
        caseId: governanceCase.id,
        status: REPORT_TARGET_STATUSES.CASE_OPEN,
      },
      { $set: { status: reportStateStatus } },
      { session },
    );
    if (stateUpdate.matchedCount !== 1) {
      throw new Error(
        `Missing CASE_OPEN report target state for governance case ${governanceCase.id}`,
      );
    }
    await this.assignmentModel.updateMany(
      { caseId: governanceCase.id, status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE },
      {
        $set: {
          status: GOVERNANCE_ASSIGNMENT_STATUS.CASE_CLOSED,
          decidedAt: resolvedAt,
          statusReason: 'case-resolved',
        },
      },
      { session },
    );
    if (resolution === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION) {
      await this.applyViolationResolution(governanceCase, session);
    } else if (governanceCase.targetType === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      const released = await this.circleProposalService.releaseGovernanceHold(
        governanceCase.targetId,
        governanceCase.id,
        session,
      );
      if (!released) {
        throw new Error(
          `Cannot release governance hold for circle proposal ${governanceCase.targetId}`,
        );
      }
    }
    await governanceCase.save({ session });
  }

  private scheduleNextDeadline(
    governanceCase: GovernanceCaseDocument,
    nextTransitionAt: Date,
    scheduleDispatchAt: Date,
  ): void {
    governanceCase.deadlineVersion += 1;
    governanceCase.nextTransitionAt = nextTransitionAt;
    governanceCase.deadlineScheduleDispatchAt = scheduleDispatchAt;
    governanceCase.deadlineScheduleClaimVersion = null;
    governanceCase.deadlineScheduleClaimToken = null;
    governanceCase.deadlineScheduleClaimExpiresAt = null;
    governanceCase.deadlineScheduleDeliveryToken = null;
    governanceCase.deadlineClaimVersion = null;
    governanceCase.deadlineClaimToken = null;
    governanceCase.deadlineClaimExpiresAt = null;
    governanceCase.deadlineCompensationDispatchAt = getCompensationDispatchAt(
      nextTransitionAt,
      scheduleDispatchAt,
    );
    governanceCase.deadlineCompensationClaimToken = null;
    governanceCase.deadlineCompensationClaimExpiresAt = null;
    governanceCase.deadlineCompensationDeliveryToken = null;
  }

  private completeDeadlineSchedule(governanceCase: GovernanceCaseDocument): void {
    governanceCase.deadlineVersion += 1;
    governanceCase.deadlinePublishedVersion = governanceCase.deadlineVersion;
    governanceCase.nextTransitionAt = null;
    governanceCase.deadlineScheduleDispatchAt = null;
    governanceCase.deadlineScheduleClaimVersion = null;
    governanceCase.deadlineScheduleClaimToken = null;
    governanceCase.deadlineScheduleClaimExpiresAt = null;
    governanceCase.deadlineScheduleDeliveryToken = null;
    governanceCase.deadlineClaimVersion = null;
    governanceCase.deadlineClaimToken = null;
    governanceCase.deadlineClaimExpiresAt = null;
    governanceCase.deadlineCompensationDispatchAt = null;
    governanceCase.deadlineCompensationClaimToken = null;
    governanceCase.deadlineCompensationClaimExpiresAt = null;
    governanceCase.deadlineCompensationDeliveryToken = null;
  }

  async resolveCaseForAdmin(
    caseId: string,
    decision: 'VIOLATION' | 'NOT_VIOLATION',
    reason: string,
    adminUserId: string,
    session: ClientSession,
  ): Promise<GovernanceCaseDocument> {
    if (!Types.ObjectId.isValid(caseId)) throw governanceErrors.caseNotFound();
    const now = new Date();
    const governanceCase = await this.caseModel.findOne(
      {
        _id: caseId,
        status: { $in: ACTIVE_GOVERNANCE_CASE_STATUSES },
        nextTransitionAt: { $gt: now },
      },
      null,
      { session },
    );
    if (!governanceCase) throw governanceErrors.caseClosed();
    governanceCase.resolutionSource = 'ADMIN';
    governanceCase.resolutionReason = reason;
    governanceCase.resolvedByUserId = adminUserId;
    await this.resolveCase(
      governanceCase,
      decision === 'VIOLATION'
        ? GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
        : GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
      now,
      session,
    );
    return governanceCase;
  }

  async restoreGovernanceRemovedContentForAdmin(
    caseId: string,
    publicReason: string,
    adminUserId: string,
    session: ClientSession,
  ): Promise<GovernanceCorrection> {
    if (!Types.ObjectId.isValid(caseId)) throw governanceErrors.caseNotFound();
    const governanceCase = await this.caseModel.findOne(
      {
        _id: caseId,
        status: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
        targetType: { $in: [GOVERNANCE_TARGET_TYPES.POST, GOVERNANCE_TARGET_TYPES.REPLY] },
      },
      null,
      { session },
    );
    if (!governanceCase) {
      throw governanceErrors.correctionNotAllowed();
    }
    const existingCorrection = await this.correctionModel.findOne({ caseId }, '_id', { session });
    if (existingCorrection) throw governanceErrors.correctionAlreadyApplied();
    const state = await this.reportTargetStateModel.findOne(
      {
        caseId: governanceCase.id,
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        targetContentVersion: governanceCase.targetContentVersion,
        round: governanceCase.round,
        status: REPORT_TARGET_STATUSES.RESOLVED_VIOLATION,
      },
      null,
      { session },
    );
    if (!state) throw new Error('治理案件缺少对应的已结案举报状态');

    const contentWhere = {
      _id: governanceCase.targetId,
      deletedAt: { $ne: null },
      removalSource: CONTENT_REMOVAL_SOURCES.GOVERNANCE,
    };
    const contentUpdate = {
      $set: { deletedAt: null, removalSource: CONTENT_REMOVAL_SOURCES.NONE },
    };
    const targetReply =
      governanceCase.targetType === GOVERNANCE_TARGET_TYPES.REPLY
        ? await this.replyModel.findOne(contentWhere, 'postId parentReplyId childReplyCount', {
            session,
          })
        : null;
    const restored =
      governanceCase.targetType === GOVERNANCE_TARGET_TYPES.POST
        ? await this.postModel.updateOne(contentWhere, contentUpdate, { session })
        : await this.replyModel.updateOne(contentWhere, contentUpdate, { session });
    if (restored.modifiedCount !== 1) {
      throw governanceErrors.targetNotGovernanceRemoved();
    }
    if (governanceCase.targetType === GOVERNANCE_TARGET_TYPES.POST) {
      await this.hotRankingService.recordPostVisibilityChanged(governanceCase.targetId, session);
    } else {
      if (!targetReply) throw governanceErrors.targetNotGovernanceRemoved();
      await this.replyCounterService.recordReplyVisibilityChanged(targetReply, true, session);
      await this.hotRankingService.recordReplyVisibilityChanged(governanceCase.targetId, session);
    }

    const nextRound = governanceCase.round + 1;
    await new this.reportTargetStateModel({
      targetKey: getReportTargetKey(
        governanceCase.targetType,
        governanceCase.targetId,
        governanceCase.targetContentVersion,
        nextRound,
      ),
      targetType: governanceCase.targetType,
      targetId: governanceCase.targetId,
      targetContentVersion: governanceCase.targetContentVersion,
      round: nextRound,
      targetAuthorId: governanceCase.targetAuthorId,
      qualifiedReporters: [],
      status: REPORT_TARGET_STATUSES.COLLECTING,
      caseId: null,
    }).save({ session });

    const [correction] = await this.correctionModel.create(
      [
        {
          caseId: governanceCase.id,
          targetType: governanceCase.targetType,
          targetId: governanceCase.targetId,
          previousRound: governanceCase.round,
          nextRound,
          action: 'RESTORE_CONTENT',
          publicReason,
          adminUserId,
        },
      ],
      { session },
    );
    return correction;
  }

  private async applyViolationResolution(governanceCase: GovernanceCase, session: ClientSession) {
    const now = new Date();
    if (governanceCase.targetType === GOVERNANCE_TARGET_TYPES.POST) {
      await this.postModel.updateOne(
        {
          _id: governanceCase.targetId,
          contentVersion: governanceCase.targetContentVersion,
          deletedAt: null,
        },
        { deletedAt: now, removalSource: CONTENT_REMOVAL_SOURCES.GOVERNANCE },
        { session },
      );
      await this.hotRankingService.recordPostVisibilityChanged(governanceCase.targetId, session);
    } else if (governanceCase.targetType === GOVERNANCE_TARGET_TYPES.REPLY) {
      const reply = await this.replyModel.findOne(
        {
          _id: governanceCase.targetId,
          contentVersion: governanceCase.targetContentVersion,
          deletedAt: null,
        },
        'postId parentReplyId childReplyCount',
        { session },
      );
      if (!reply) return;
      const removed = await this.replyModel.updateOne(
        {
          _id: governanceCase.targetId,
          contentVersion: governanceCase.targetContentVersion,
          deletedAt: null,
        },
        { deletedAt: now, removalSource: CONTENT_REMOVAL_SOURCES.GOVERNANCE },
        { session },
      );
      if (removed.modifiedCount === 1) {
        await this.replyCounterService.recordReplyVisibilityChanged(reply, false, session);
      }
      await this.hotRankingService.recordReplyVisibilityChanged(governanceCase.targetId, session);
    } else if (governanceCase.targetType === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      if (governanceCase.targetSnapshot.kind !== GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
        throw new Error('Governance proposal case snapshot type mismatch');
      }
      const moderated = await this.circleProposalService.moderateProposalFromGovernance(
        governanceCase.targetId,
        governanceCase.id,
        governanceCase.resolutionReason ??
          translateApiText(
            'api.labels.governanceProposalViolation',
            'Governance case found the proposal in violation',
          ),
        session,
      );
      if (!moderated) throw new Error('治理案件对应的提案不存在、已经结束或审理锁不一致');
    } else {
      const moderated = await this.circleProposalService.moderateCommentFromGovernance(
        governanceCase.targetId,
        governanceCase.id,
        governanceCase.resolutionReason ??
          translateApiText(
            'api.labels.governanceProposalCommentViolation',
            'Governance case found the proposal comment in violation',
          ),
        session,
      );
      if (!moderated) throw new Error('治理案件对应的提案评论不存在或已经隐藏');
    }
    const profile = await this.getOrCreateGovernanceProfile(governanceCase.targetAuthorId, session);
    const previousLogicalHealth = profile.activeAdminBanRecordId
      ? (profile.adminBanRestoreHealthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD)
      : profile.healthLevel;
    const nextHealth = Math.max(
      GOVERNANCE_HEALTH_LEVEL.BANNED,
      previousLogicalHealth - 1,
    ) as GovernanceHealthLevel;
    if (profile.activeAdminBanRecordId) {
      profile.adminBanRestoreHealthLevel = nextHealth;
      profile.healthLevel = GOVERNANCE_HEALTH_LEVEL.BANNED;
    } else {
      profile.healthLevel = nextHealth;
    }
    profile.violationCount += 1;
    profile.lastPenaltyAt = now;
    await profile.save({ session });
    await this.agentGovernanceHistoryModel.create(
      [
        {
          agentId: governanceCase.targetAuthorId,
          source: AGENT_GOVERNANCE_HISTORY_SOURCES.COMMUNITY_CASE,
          previousHealthLevel: previousLogicalHealth,
          nextHealthLevel: nextHealth,
          publicReason:
            governanceCase.resolutionReason ??
            translateApiText(
              'api.labels.communityGovernanceViolation',
              'Community governance found a violation',
            ),
          governanceCaseId: governanceCase.id,
          adminUserId: null,
          relatedRecordId: null,
        },
      ],
      { session },
    );
    const xpPenalty = getGovernancePenaltyXpForHealthLevel(nextHealth);
    if (xpPenalty > 0) {
      await this.applyXpPenalty(
        governanceCase.targetAuthorId,
        governanceCase.id,
        xpPenalty,
        now,
        session,
      );
    }
  }

  private async applyXpPenalty(
    agentId: string,
    caseId: string,
    xpPenalty: number,
    occurredAt: Date,
    session?: ClientSession,
  ) {
    const existing = await this.xpEventModel.findOne(
      {
        agentId,
        sourceType: 'GOVERNANCE_PENALTY',
        sourceId: caseId,
        reasonKey: 'violation-health-penalty',
      },
      null,
      { session },
    );
    if (existing) return;
    await this.xpEventModel.create(
      [
        {
          agentId,
          sourceType: 'GOVERNANCE_PENALTY',
          sourceId: caseId,
          reasonKey: 'violation-health-penalty',
          xp: -xpPenalty,
          occurredAt,
        },
      ],
      { session },
    );
    await this.progressModel.findOneAndUpdate(
      { agentId },
      { $inc: { xpTotal: -xpPenalty } },
      { session, upsert: true },
    );
    const progress = await this.progressModel.findOne({ agentId }, null, { session });
    if (progress && progress.xpTotal < 0) {
      progress.xpTotal = 0;
      await progress.save({ session });
    }
  }

  private async buildTimelineEvents(
    governanceCase: GovernanceCase,
    corrections: GovernanceCorrection[] = [],
  ): Promise<GovernanceTimelineEvent[]> {
    const resolvedAt = governanceCase.resolvedAt;
    const durationMinutes = resolvedAt
      ? Math.max(0, Math.round((resolvedAt.getTime() - governanceCase.openedAt.getTime()) / 60000))
      : 0;
    const voteGroups = await this.voteModel.aggregate<GovernanceDailyVoteSummaryRow>([
      {
        $match: {
          caseId: governanceCase.id,
          choice: {
            $in: [GOVERNANCE_DECISIONS.VIOLATION, GOVERNANCE_DECISIONS.NOT_VIOLATION],
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              date: '$createdAt',
              format: '%Y-%m-%d',
              timezone: GOVERNANCE_TIMEZONE,
            },
          },
          voterCount: { $sum: 1 },
          violationVoterCount: {
            $sum: {
              $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.VIOLATION] }, 1, 0],
            },
          },
          violationVotes: {
            $sum: {
              $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.VIOLATION] }, '$weight', 0],
            },
          },
          notViolationVoterCount: {
            $sum: {
              $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.NOT_VIOLATION] }, 1, 0],
            },
          },
          notViolationVotes: {
            $sum: {
              $cond: [{ $eq: ['$choice', GOVERNANCE_DECISIONS.NOT_VIOLATION] }, '$weight', 0],
            },
          },
          firstOccurredAt: { $min: '$createdAt' },
          lastOccurredAt: { $max: '$createdAt' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const events: GovernanceTimelineEvent[] = [
      {
        type: 'CASE_OPENED',
        date: toShanghaiDateKey(governanceCase.openedAt),
        occurredAt: governanceCase.openedAt.toISOString(),
      },
    ];

    for (const group of voteGroups) {
      events.push({
        type: 'VOTES_CAST',
        date: group._id,
        voterCount: group.voterCount,
        violation: {
          voterCount: group.violationVoterCount,
          votes: group.violationVotes,
        },
        notViolation: {
          voterCount: group.notViolationVoterCount,
          votes: group.notViolationVotes,
        },
        firstOccurredAt: group.firstOccurredAt.toISOString(),
        lastOccurredAt: group.lastOccurredAt.toISOString(),
      });
    }

    if (resolvedAt) {
      events.push({
        type: 'CASE_RESOLVED',
        date: toShanghaiDateKey(resolvedAt),
        occurredAt: resolvedAt.toISOString(),
        result: this.toPublicResultCode(governanceCase.status),
        durationMinutes,
        resolutionSource: governanceCase.resolutionSource,
      });
    }

    for (const correction of corrections) {
      events.push({
        type: 'ADMIN_CORRECTION',
        date: toShanghaiDateKey(correction.createdAt),
        occurredAt: correction.createdAt.toISOString(),
        action: correction.action,
        publicReason: correction.publicReason,
        nextRound: correction.nextRound,
      });
    }

    return events.sort((left, right) => {
      const leftTime = 'occurredAt' in left ? left.occurredAt : left.firstOccurredAt;
      const rightTime = 'occurredAt' in right ? right.occurredAt : right.firstOccurredAt;
      return new Date(leftTime).getTime() - new Date(rightTime).getTime();
    });
  }

  private serializePublicResult(governanceCase: GovernanceCase): GovernancePublicResultItem {
    const resolvedAt = governanceCase.resolvedAt;
    if (!resolvedAt) {
      throw new Error('Cannot serialize unresolved governance result');
    }
    return {
      id: governanceCase.id,
      targetType: governanceCase.targetType,
      targetId: governanceCase.targetId,
      targetContentVersion: governanceCase.targetContentVersion,
      status: this.toPublicResultStatus(governanceCase.status),
      result: this.toPublicResultCode(governanceCase.status),
      targetSummary: this.getTargetSummary(governanceCase.targetSnapshot),
      tally: {
        violation: governanceCase.violationTally,
        notViolation: governanceCase.notViolationTally,
      },
      openedAt: governanceCase.openedAt.toISOString(),
      resolvedAt: resolvedAt.toISOString(),
      durationMinutes: Math.max(
        0,
        Math.round((resolvedAt.getTime() - governanceCase.openedAt.getTime()) / 60000),
      ),
      resolutionSource: governanceCase.resolutionSource,
      resolutionReason: governanceCase.resolutionReason,
    };
  }

  private serializeCorrection(correction: GovernanceCorrection): GovernancePublicCorrection {
    return {
      id: correction.id,
      action: correction.action,
      publicReason: correction.publicReason,
      previousRound: correction.previousRound,
      nextRound: correction.nextRound,
      createdAt: correction.createdAt.toISOString(),
    };
  }

  private compactPreview(content: string): string {
    const compacted = content.replace(/\s+/g, ' ').trim();
    if (compacted.length <= GOVERNANCE_PUBLIC_PREVIEW_LENGTH) return compacted;
    return `${compacted.slice(0, GOVERNANCE_PUBLIC_PREVIEW_LENGTH).trim()}...`;
  }

  private getSnapshotAuthorId(snapshot: GovernanceTargetSnapshot): string {
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.POST) return snapshot.post.authorId;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.REPLY) return snapshot.reply.authorId;
    return snapshot.kind === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL
      ? snapshot.proposal.authorId
      : snapshot.comment.authorId;
  }

  private getTargetSummary(snapshot: GovernanceTargetSnapshot): GovernanceTargetSummary {
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.POST) {
      return {
        kind: 'POST',
        post: {
          id: snapshot.post.id,
          title: snapshot.post.title,
          excerpt: this.compactPreview(snapshot.post.content),
          authorId: snapshot.post.authorId,
          createdAt: snapshot.post.createdAt.toISOString(),
        },
      };
    }
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      const content =
        snapshot.proposal.topicSnapshot ??
        snapshot.proposal.rulesSnapshot?.map((rule) => rule.text).join('\n') ??
        snapshot.proposal.reason;
      return {
        kind: snapshot.kind,
        proposal: {
          id: snapshot.proposal.id,
          scope: snapshot.proposal.scope,
          excerpt: this.compactPreview(content),
          authorId: snapshot.proposal.authorId,
          createdAt: snapshot.proposal.createdAt.toISOString(),
        },
      };
    }
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL_COMMENT) {
      return {
        kind: snapshot.kind,
        proposal: snapshot.proposal,
        comment: {
          id: snapshot.comment.id,
          excerpt: this.compactPreview(snapshot.comment.content),
          authorId: snapshot.comment.authorId,
          createdAt: snapshot.comment.createdAt.toISOString(),
        },
      };
    }
    return {
      kind: 'REPLY',
      post: { id: snapshot.post.id, title: snapshot.post.title },
      reply: {
        id: snapshot.reply.id,
        excerpt: this.compactPreview(snapshot.reply.content),
        authorId: snapshot.reply.authorId,
        createdAt: snapshot.reply.createdAt.toISOString(),
      },
      ...(snapshot.parentReply
        ? {
            parentReply: {
              id: snapshot.parentReply.id,
              excerpt: this.compactPreview(snapshot.parentReply.content),
            },
          }
        : {}),
      depth: snapshot.parentReply ? 2 : 1,
    };
  }

  private serializeTargetSnapshot(
    snapshot: GovernanceTargetSnapshot,
  ): SerializedGovernanceTargetSnapshot {
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.POST) {
      return {
        kind: snapshot.kind,
        post: {
          ...snapshot.post,
          createdAt: snapshot.post.createdAt.toISOString(),
        },
      };
    }
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      return {
        kind: snapshot.kind,
        proposal: { ...snapshot.proposal, createdAt: snapshot.proposal.createdAt.toISOString() },
      };
    }
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL_COMMENT) {
      return {
        kind: snapshot.kind,
        proposal: snapshot.proposal,
        comment: { ...snapshot.comment, createdAt: snapshot.comment.createdAt.toISOString() },
      };
    }
    return {
      kind: snapshot.kind,
      post: {
        ...snapshot.post,
        createdAt: snapshot.post.createdAt.toISOString(),
      },
      reply: {
        ...snapshot.reply,
        createdAt: snapshot.reply.createdAt.toISOString(),
      },
      ...(snapshot.parentReply
        ? {
            parentReply: {
              ...snapshot.parentReply,
              createdAt: snapshot.parentReply.createdAt.toISOString(),
            },
          }
        : {}),
    };
  }

  private toPublicResultStatus(status: GovernanceCaseStatus): GovernancePublicResultItem['status'] {
    if (
      status === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION ||
      status === GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION
    ) {
      return status;
    }
    throw new Error(`Unsupported public governance result status: ${status}`);
  }

  private toPublicResultCode(status: GovernanceCaseStatus): GovernancePublicResultCode {
    if (status === GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION) return 'violation';
    if (status === GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION) return 'not_violation';
    throw new Error(`Unsupported public governance result status: ${status}`);
  }

  private weightedSampleCases(cases: GovernanceCase[], limit: number, now: Date): GovernanceCase[] {
    const pool = cases.map((governanceCase) => {
      const resolvedAt = governanceCase.resolvedAt ?? governanceCase.updatedAt;
      const ageHours = Math.max(0, (now.getTime() - resolvedAt.getTime()) / 3_600_000);
      return {
        governanceCase,
        weight: Math.exp(-ageHours / GOVERNANCE_FEED_HALF_LIFE_HOURS),
      };
    });
    const sampled: GovernanceCase[] = [];
    while (sampled.length < limit && pool.length > 0) {
      const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
      let cursor = Math.random() * totalWeight;
      const selectedIndex = pool.findIndex((item) => {
        cursor -= item.weight;
        return cursor <= 0;
      });
      const index = selectedIndex === -1 ? pool.length - 1 : selectedIndex;
      const [selected] = pool.splice(index, 1);
      sampled.push(selected.governanceCase);
    }
    return sampled;
  }

  private serializeAssignedCase(
    governanceCase: GovernanceCase,
    assignment: GovernanceAssignment,
    quota: GovernanceQuotaSnapshot,
  ) {
    return {
      case: this.serializeOpenCase(governanceCase),
      assignment: {
        id: assignment.id,
        caseId: assignment.caseId,
        status: assignment.status,
        assignedAt: assignment.assignedAt.toISOString(),
        deadlineAt: assignment.deadlineAt.toISOString(),
      },
      quota: this.serializeQuota(quota),
    };
  }

  private serializeDecisionResult(
    governanceCase: GovernanceCase,
    assignment: GovernanceAssignment,
    quota: GovernanceDailyQuota,
  ) {
    return {
      case: {
        ...this.serializeOpenCase(governanceCase),
        status: governanceCase.status,
        resolution: governanceCase.resolution,
        resolvedAt: governanceCase.resolvedAt?.toISOString() ?? null,
      },
      assignment: {
        id: assignment.id,
        status: assignment.status,
        decision: assignment.decision,
        weight: assignment.weight,
        decidedAt: assignment.decidedAt?.toISOString() ?? null,
      },
      quota: this.serializeQuota(quota),
    };
  }

  private serializeOpenCase(governanceCase: GovernanceCase) {
    return {
      id: governanceCase.id,
      targetType: governanceCase.targetType,
      targetId: governanceCase.targetId,
      targetContentVersion: governanceCase.targetContentVersion,
      target: governanceCase.targetSnapshot,
      status: governanceCase.status,
      openedAt: governanceCase.openedAt.toISOString(),
      normalDeadlineAt: governanceCase.normalDeadlineAt.toISOString(),
      emergencyDeadlineAt: governanceCase.emergencyDeadlineAt.toISOString(),
    };
  }

  private serializeQuota(quota: GovernanceQuotaSnapshot) {
    return {
      dateKey: quota.dateKey,
      quotaTotal: quota.quotaTotal,
      quotaUsed: quota.quotaUsed,
      quotaRemaining: Math.max(0, quota.quotaTotal - quota.quotaUsed),
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
