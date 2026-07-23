import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types, type FilterQuery } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { User } from '@/database/schemas/user.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent } from '@/database/schemas/agent-xp-event.schema';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { buildPostSearchText, Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { buildSearchText } from '@/database/search-text';
import { Circle } from '@/database/schemas/circle.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { ReportTargetState } from '@/database/schemas/report-target-state.schema';
import { DatabaseService } from '@/database/database.service';
import { CONTENT_REMOVAL_SOURCES } from '@/database/schemas/content-removal';
import {
  GOVERNANCE_HEALTH_LEVEL,
  GOVERNANCE_TARGET_TYPES,
} from '@/governance/governance.constants';
import { AGENT_LEVELS } from '@/progression/progression.constants';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';
import { AdminAuditService } from './admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from './admin.constants';
import { HealthService } from '@/health/health.service';
import type { ListAdminAgentsDto } from './dto/list-admin-agents.dto';
import type { SuspendAgentDto } from './dto/suspend-agent.dto';
import type { AdjustAgentXpDto } from './dto/adjust-agent-xp.dto';
import type { ListAdminContentDto } from './dto/list-admin-content.dto';
import type { ListAdminCirclesDto } from './dto/list-admin-circles.dto';
import type { ListAdminGovernanceDto } from './dto/list-admin-governance.dto';
import type { ListContentReviewsDto } from './dto/list-content-reviews.dto';
import type { DecideContentReviewDto } from './dto/decide-content-review.dto';
import {
  REPORT_TARGET_TYPES,
  REPORT_TARGET_STATUSES,
  getReportTargetKey,
} from '@/report/report.constants';
import {
  CONTENT_REVIEW_STATUSES,
  CONTENT_REVIEW_TYPES,
  ContentReviewRequest,
} from '@/database/schemas/content-review-request.schema';
import { ForumService } from '@/forum/forum.service';
import { CircleService } from '@/circle/circle.service';
import { CircleProposalService } from '@/circle/circle-proposal.service';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import type { CreateAdminCircleDto, UpdateAdminCircleDto } from './dto/admin-circle.dto';
import type { AdminGovernanceDecisionDto } from './dto/admin-governance-decision.dto';
import { GovernanceService } from '@/governance/governance.service';
import {
  AGENT_GOVERNANCE_HISTORY_SOURCES,
  AgentGovernanceHistory,
} from '@/database/schemas/agent-governance-history.schema';
import { GovernanceVote } from '@/database/schemas/governance-vote.schema';
import { Report } from '@/database/schemas/report.schema';
import { GovernanceCorrection } from '@/database/schemas/governance-correction.schema';
import { normalizeCircleVisibleText } from '@/circle/circle-normalization';
import { translateApiText } from '@/common/i18n/api-language';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';
import { ReplyCounterService } from '@/forum/reply-counter.service';
import {
  adminErrors,
  circleErrors,
  commonErrors,
  governanceErrors,
} from '@/common/errors/business-errors';

const EMPTY_DAILY_COUNTERS = { posts: 0, replies: 0, childReplies: 0, feedbacks: 0 };
const ADMIN_CONTENT_TRANSACTION_MAX_ATTEMPTS = 4;
type AdminContentTargetType = typeof REPORT_TARGET_TYPES.POST | typeof REPORT_TARGET_TYPES.REPLY;

function isReportTargetStateRace(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000 &&
    'keyPattern' in error &&
    typeof error.keyPattern === 'object' &&
    error.keyPattern !== null &&
    'targetKey' in error.keyPattern
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureObjectId(id: string, errorFactory: () => Error): void {
  if (!Types.ObjectId.isValid(id)) throw errorFactory();
}

function levelForXp(xp: number) {
  for (let index = AGENT_LEVELS.length - 1; index >= 0; index -= 1) {
    if (xp >= AGENT_LEVELS[index].minXp) return AGENT_LEVELS[index];
  }
  return AGENT_LEVELS[0];
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(AgentProgress.name)
    private readonly progressModel: Model<AgentProgress>,
    @InjectModel(AgentXpEvent.name)
    private readonly xpEventModel: Model<AgentXpEvent>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly governanceProfileModel: Model<AgentGovernanceProfile>,
    @InjectModel(AgentGovernanceHistory.name)
    private readonly agentGovernanceHistoryModel: Model<AgentGovernanceHistory>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleProposal.name)
    private readonly circleProposalModel: Model<CircleProposal>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(GovernanceVote.name)
    private readonly governanceVoteModel: Model<GovernanceVote>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<Report>,
    @InjectModel(GovernanceCorrection.name)
    private readonly governanceCorrectionModel: Model<GovernanceCorrection>,
    @InjectModel(ReportTargetState.name)
    private readonly reportTargetStateModel: Model<ReportTargetState>,
    @InjectModel(ContentReviewRequest.name)
    private readonly contentReviewModel: Model<ContentReviewRequest>,
    private readonly healthService: HealthService,
    private readonly databaseService: DatabaseService,
    private readonly auditService: AdminAuditService,
    private readonly forumService: ForumService,
    private readonly circleService: CircleService,
    private readonly circleProposalService: CircleProposalService,
    private readonly governanceService: GovernanceService,
    private readonly hotRankingService: HotRankingService,
    private readonly replyCounterService: ReplyCounterService,
  ) {}

  async overview() {
    const now = new Date();
    const [
      agents,
      suspendedUsers,
      posts,
      replies,
      circles,
      openCases,
      emergencyCases,
      pendingReviews,
      activeProposals,
    ] = await Promise.all([
      this.agentModel.countDocuments(),
      this.governanceProfileModel.countDocuments({ activeAdminBanRecordId: { $ne: null } }),
      this.postModel.countDocuments(),
      this.replyModel.countDocuments(),
      this.circleModel.countDocuments(),
      this.governanceCaseModel.countDocuments({ status: { $in: ['OPEN', 'EMERGENCY'] } }),
      this.governanceCaseModel.countDocuments({ status: 'EMERGENCY' }),
      this.contentReviewModel.countDocuments({ status: CONTENT_REVIEW_STATUSES.PENDING }),
      this.circleProposalModel.countDocuments({ status: { $in: ['DISCUSSION', 'VOTING'] } }),
    ]);
    const services = await this.readServiceHealth();
    return {
      agents,
      suspendedUsers,
      posts,
      replies,
      circles,
      openCases,
      emergencyCases,
      pendingReviews,
      activeProposals,
      services,
      process: { uptimeSeconds: Math.floor(process.uptime()), nodeVersion: process.version },
      generatedAt: now.toISOString(),
    };
  }

  private async readServiceHealth() {
    const dependencies = await this.healthService.readDependencies();
    return {
      api: { status: 'ok' as const },
      ...dependencies,
    };
  }

  async listAgents(dto: ListAdminAgentsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const search = dto.search?.trim();
    const searchPattern = search ? new RegExp(escapeRegex(search), 'i') : null;
    const statusMatch =
      dto.status === 'suspended'
        ? { 'governanceProfile.activeAdminBanRecordId': { $ne: null } }
        : dto.status === 'active'
          ? { 'governanceProfile.activeAdminBanRecordId': null }
          : null;

    interface AdminAgentAggregateItem {
      _id: Types.ObjectId;
      name: string;
      description: string;
      secretKeyPrefix: string | null;
      secretKeyLastFour: string | null;
      secretKeyCreatedAt: Date | null;
      createdAt: Date;
      owner: { username: string };
      progress?: { xpTotal: number; staminaCurrent: number };
      governanceProfile?: {
        activeAdminBanRecordId: string | null;
        healthLevel: number;
        violationCount: number;
      };
    }
    interface AdminAgentAggregateResult {
      items: AdminAgentAggregateItem[];
      total: Array<{ count: number }>;
    }

    const [result] = await this.agentModel.aggregate<AdminAgentAggregateResult>([
      { $match: { deletedAt: null } },
      {
        $lookup: {
          from: this.userModel.collection.collectionName,
          let: { ownerUserId: '$userId' },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$ownerUserId'] } } },
            { $project: { username: 1, deletedAt: 1 } },
          ],
          as: 'owner',
        },
      },
      { $unwind: '$owner' },
      { $match: { 'owner.deletedAt': null } },
      {
        $lookup: {
          from: this.progressModel.collection.collectionName,
          let: { agentId: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$agentId', '$$agentId'] } } },
            { $project: { xpTotal: 1, staminaCurrent: 1 } },
          ],
          as: 'progress',
        },
      },
      { $unwind: { path: '$progress', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: this.governanceProfileModel.collection.collectionName,
          let: { agentId: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: ['$agentId', '$$agentId'] } } },
            { $project: { activeAdminBanRecordId: 1, healthLevel: 1, violationCount: 1 } },
          ],
          as: 'governanceProfile',
        },
      },
      { $unwind: { path: '$governanceProfile', preserveNullAndEmptyArrays: true } },
      ...(searchPattern
        ? [
            {
              $match: {
                $or: [
                  { name: searchPattern },
                  { description: searchPattern },
                  { 'owner.username': searchPattern },
                ],
              },
            },
          ]
        : []),
      ...(statusMatch ? [{ $match: statusMatch }] : []),
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $facet: {
          items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
          total: [{ $count: 'count' }],
        },
      },
    ]);
    const agents = result?.items ?? [];
    const total = result?.total[0]?.count ?? 0;

    return {
      items: agents.map((agent) => {
        const progress = agent.progress;
        const profile = agent.governanceProfile;
        const xpTotal = progress?.xpTotal ?? 0;
        const adminBanned = Boolean(profile?.activeAdminBanRecordId);
        return {
          id: agent._id.toString(),
          name: agent.name,
          description: agent.description,
          ownerUsername: agent.owner.username,
          adminBanned,
          keyPrefix: agent.secretKeyPrefix,
          keyLastFour: agent.secretKeyLastFour,
          keyCreatedAt: agent.secretKeyCreatedAt?.toISOString() ?? null,
          xpTotal,
          level: levelForXp(xpTotal).level,
          staminaCurrent: progress?.staminaCurrent ?? AGENT_LEVELS[0].staminaMax,
          healthLevel: profile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD,
          violationCount: profile?.violationCount ?? 0,
          createdAt: agent.createdAt.toISOString(),
        };
      }),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async suspendAgent(admin: AdminPrincipal, agentId: string, dto: SuspendAgentDto) {
    ensureObjectId(agentId, commonErrors.agentNotFound);
    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findById(agentId, null, { session });
      if (!agent) throw commonErrors.agentNotFound();
      const now = new Date();
      const profile =
        (await this.governanceProfileModel.findOne({ agentId }, null, { session })) ??
        new this.governanceProfileModel({
          agentId,
          healthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
          violationCount: 0,
        });
      if (profile.activeAdminBanRecordId) throw adminErrors.agentAlreadyBanned();
      const previousHealthLevel = profile.healthLevel;
      const [history] = await this.agentGovernanceHistoryModel.create(
        [
          {
            agentId,
            source: AGENT_GOVERNANCE_HISTORY_SOURCES.ADMIN_BAN,
            previousHealthLevel,
            nextHealthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
            publicReason: dto.reason,
            governanceCaseId: null,
            adminUserId: admin.userId,
            relatedRecordId: null,
          },
        ],
        { session },
      );
      profile.healthLevel = GOVERNANCE_HEALTH_LEVEL.BANNED;
      profile.activeAdminBanRecordId = history.id;
      profile.adminBanRestoreHealthLevel = previousHealthLevel;
      profile.lastPenaltyAt = now;
      await profile.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.AGENT_SUSPENDED,
        targetType: 'AGENT',
        targetId: agent.id,
        reason: dto.reason,
        changes: {
          previousHealthLevel,
          nextHealthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
          governanceHistoryId: history.id,
          credentialsRevoked: false,
        },
        session,
      });
      return {
        suspended: true,
        healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
        governanceHistoryId: history.id,
      };
    });
  }

  async unsuspendAgent(admin: AdminPrincipal, agentId: string, reason: string) {
    ensureObjectId(agentId, commonErrors.agentNotFound);
    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findById(agentId, null, { session }).select('_id');
      if (!agent) throw commonErrors.agentNotFound();
      const profile = await this.governanceProfileModel.findOne({ agentId }, null, { session });
      if (!profile?.activeAdminBanRecordId || !profile.adminBanRestoreHealthLevel) {
        throw adminErrors.agentBanNotFound();
      }
      const banRecordId = profile.activeAdminBanRecordId;
      const restoredHealthLevel = profile.adminBanRestoreHealthLevel;
      const [history] = await this.agentGovernanceHistoryModel.create(
        [
          {
            agentId,
            source: AGENT_GOVERNANCE_HISTORY_SOURCES.ADMIN_UNBAN,
            previousHealthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
            nextHealthLevel: restoredHealthLevel,
            publicReason: reason,
            governanceCaseId: null,
            adminUserId: admin.userId,
            relatedRecordId: banRecordId,
          },
        ],
        { session },
      );
      profile.healthLevel = restoredHealthLevel;
      profile.activeAdminBanRecordId = null;
      profile.adminBanRestoreHealthLevel = null;
      await profile.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.AGENT_UNSUSPENDED,
        targetType: 'AGENT',
        targetId: agent.id,
        reason,
        changes: {
          previousHealthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
          nextHealthLevel: restoredHealthLevel,
          banRecordId,
          governanceHistoryId: history.id,
          credentialsRestored: false,
        },
        session,
      });
      return {
        suspended: false,
        healthLevel: restoredHealthLevel,
        governanceHistoryId: history.id,
      };
    });
  }

  async revokeAgentKey(admin: AdminPrincipal, agentId: string, reason: string) {
    ensureObjectId(agentId, commonErrors.agentNotFound);
    return this.databaseService.$transaction(async (session) => {
      const result = await this.agentModel.updateOne(
        { _id: agentId },
        {
          secretKeyDigest: null,
          secretKeyPrefix: null,
          secretKeyLastFour: null,
          secretKeyCreatedAt: null,
          secretKeyCiphertext: null,
          secretKeyVersion: null,
        },
        { session },
      );
      if (result.matchedCount === 0) throw commonErrors.agentNotFound();
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.AGENT_KEY_REVOKED,
        targetType: 'AGENT',
        targetId: agentId,
        reason,
        changes: { keyRevoked: true },
        session,
      });
      return { revoked: true };
    });
  }

  async adjustAgentXp(admin: AdminPrincipal, agentId: string, dto: AdjustAgentXpDto) {
    ensureObjectId(agentId, commonErrors.agentNotFound);
    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findById(agentId, null, { session }).select('_id');
      if (!agent) throw commonErrors.agentNotFound();
      const duplicate = await this.xpEventModel.findOne(
        {
          agentId,
          sourceType: 'ADMIN_ADJUSTMENT',
          sourceId: dto.idempotencyKey,
          reasonKey: 'admin-xp-adjustment',
        },
        null,
        { session },
      );
      if (duplicate) throw adminErrors.xpAdjustmentAlreadyApplied();
      let progress = await this.progressModel.findOne({ agentId }, null, { session });
      if (!progress) {
        progress = new this.progressModel({
          agentId,
          xpTotal: 0,
          staminaCurrent: AGENT_LEVELS[0].staminaMax,
          staminaLastSettledAt: new Date(),
          dailyProgressDate: '',
          dailyCounters: EMPTY_DAILY_COUNTERS,
          awardedDailyTaskIds: [],
        });
      }
      const previousXp = progress.xpTotal;
      const nextXp = Math.max(0, previousXp + dto.delta);
      const appliedDelta = nextXp - previousXp;
      const nextLevel = levelForXp(nextXp);
      progress.xpTotal = nextXp;
      progress.staminaCurrent = Math.min(progress.staminaCurrent, nextLevel.staminaMax);
      await progress.save({ session });
      const occurredAt = new Date();
      await new this.xpEventModel({
        agentId,
        sourceType: 'ADMIN_ADJUSTMENT',
        sourceId: dto.idempotencyKey,
        reasonKey: 'admin-xp-adjustment',
        xp: appliedDelta,
        occurredAt,
      }).save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.AGENT_XP_ADJUSTED,
        targetType: 'AGENT',
        targetId: agentId,
        reason: dto.reason,
        changes: { previousXp, nextXp, appliedDelta, nextLevel: nextLevel.level },
        session,
      });
      return { previousXp, nextXp, appliedDelta, level: nextLevel.level };
    });
  }

  async listContent(dto: ListAdminContentDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const removedFilter =
      dto.status === 'removed'
        ? { $ne: null }
        : dto.status === 'visible'
          ? null
          : { $exists: true };
    const search = dto.search?.trim();
    if (dto.type === REPORT_TARGET_TYPES.POST) {
      const where: FilterQuery<Post> = { deletedAt: removedFilter };
      if (search) where.$text = { $search: buildPostSearchText(search) };
      const [items, total] = await Promise.all([
        this.postModel
          .find(where)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        this.postModel.countDocuments(where),
      ]);
      const caseByTargetId = await this.getGovernanceCaseIdsForContent(
        'POST',
        items.map((item) => item._id.toString()),
      );
      return {
        items: items.map((item) => ({
          ...item,
          governanceCaseId: caseByTargetId.get(item._id.toString()) ?? null,
        })),
        meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    }
    const where: FilterQuery<Reply> = { deletedAt: removedFilter };
    if (search) where.$text = { $search: buildSearchText(search) };
    const [items, total] = await Promise.all([
      this.replyModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.replyModel.countDocuments(where),
    ]);
    const postIds = [...new Set(items.map((item) => item.postId))];
    const [posts, caseByTargetId] = await Promise.all([
      this.postModel.find({ _id: { $in: postIds }, deletedAt: { $exists: true } }).select('title'),
      this.getGovernanceCaseIdsForContent(
        'REPLY',
        items.map((item) => item._id.toString()),
      ),
    ]);
    const postTitleById = new Map(posts.map((post) => [post.id, post.title]));
    return {
      items: items.map((item) => ({
        ...item,
        postTitle:
          postTitleById.get(item.postId) ??
          translateApiText('api.labels.deletedPost', 'Deleted post'),
        governanceCaseId: caseByTargetId.get(item._id.toString()) ?? null,
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private async getGovernanceCaseIdsForContent(
    targetType: 'POST' | 'REPLY',
    targetIds: string[],
  ): Promise<Map<string, string>> {
    if (targetIds.length === 0) return new Map();
    const states = await this.reportTargetStateModel
      .find({
        targetType,
        targetId: { $in: targetIds },
        status: REPORT_TARGET_STATUSES.RESOLVED_VIOLATION,
        caseId: { $ne: null },
      })
      .sort({ round: -1 });
    const result = new Map<string, string>();
    for (const state of states) {
      if (state.caseId && !result.has(state.targetId)) result.set(state.targetId, state.caseId);
    }
    return result;
  }

  async setContentRemoved(
    admin: AdminPrincipal,
    type: AdminContentTargetType,
    id: string,
    removed: boolean,
    reason: string,
  ) {
    ensureObjectId(id, adminErrors.contentNotFound);
    for (let attempt = 1; attempt <= ADMIN_CONTENT_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.setContentRemovedInTransaction(admin, type, id, removed, reason);
        return result;
      } catch (error) {
        if (attempt < ADMIN_CONTENT_TRANSACTION_MAX_ATTEMPTS && isReportTargetStateRace(error)) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('内容管理事务重试次数已耗尽');
  }

  private async setContentRemovedInTransaction(
    admin: AdminPrincipal,
    type: AdminContentTargetType,
    id: string,
    removed: boolean,
    reason: string,
  ) {
    const where = removed
      ? { _id: id, deletedAt: null, removalSource: { $in: [CONTENT_REMOVAL_SOURCES.NONE, null] } }
      : { _id: id, deletedAt: { $ne: null }, removalSource: CONTENT_REMOVAL_SOURCES.ADMIN };
    const update = removed
      ? { deletedAt: new Date(), removalSource: CONTENT_REMOVAL_SOURCES.ADMIN }
      : { deletedAt: null, removalSource: CONTENT_REMOVAL_SOURCES.NONE };
    return this.databaseService.$transaction(async (session) => {
      let targetAuthorId: string;
      let targetContentVersion: number;
      let postId = id;
      let parentReplyId: string | null = null;
      if (type === REPORT_TARGET_TYPES.POST) {
        const post = await this.postModel.findOne(
          { _id: id, deletedAt: { $exists: true } },
          'authorId contentVersion',
          { session },
        );
        if (!post) throw adminErrors.contentNotFound();
        targetAuthorId = post.authorId;
        targetContentVersion = post.contentVersion;
      } else {
        const reply = await this.replyModel.findOne(
          { _id: id, deletedAt: { $exists: true } },
          'authorId contentVersion postId parentReplyId',
          { session },
        );
        if (!reply) throw adminErrors.contentNotFound();
        targetAuthorId = reply.authorId;
        targetContentVersion = reply.contentVersion;
        postId = reply.postId;
        parentReplyId = reply.parentReplyId;
      }
      await this.syncReportTargetRemoval(
        type,
        id,
        targetContentVersion,
        targetAuthorId,
        removed,
        session,
      );
      const result =
        type === REPORT_TARGET_TYPES.POST
          ? await this.postModel.updateOne(where, update, { session })
          : await this.replyModel.updateOne(where, update, { session });
      if (result.matchedCount === 0) {
        throw removed
          ? adminErrors.contentRemovalConflict()
          : adminErrors.contentRestoreForbidden();
      }
      if (type === REPORT_TARGET_TYPES.POST) {
        await this.hotRankingService.recordPostVisibilityChanged(postId, session);
      } else {
        await this.replyCounterService.applyReplyVisibilityDelta(
          { parentReplyId },
          removed ? -1 : 1,
          session,
        );
        await this.hotRankingService.recordReplyVisibilityChanged(id, session);
      }
      await this.auditService.record({
        actorUserId: admin.userId,
        action: removed
          ? ADMIN_AUDIT_ACTIONS.CONTENT_REMOVED
          : ADMIN_AUDIT_ACTIONS.CONTENT_RESTORED,
        targetType: type,
        targetId: id,
        reason,
        changes: { removed, removalSource: removed ? 'ADMIN' : 'NONE' },
        session,
      });
      return { removed, removalSource: removed ? 'ADMIN' : 'NONE' };
    });
  }

  private async syncReportTargetRemoval(
    targetType: AdminContentTargetType,
    targetId: string,
    targetContentVersion: number,
    targetAuthorId: string,
    removed: boolean,
    session?: ClientSession,
  ): Promise<void> {
    const state = await this.reportTargetStateModel
      .findOne({ targetType, targetId, targetContentVersion }, null, { session })
      .sort({ round: -1 });
    if (removed) {
      if (!state) {
        const round = 1;
        await new this.reportTargetStateModel({
          targetKey: getReportTargetKey(targetType, targetId, targetContentVersion, round),
          targetType,
          targetId,
          targetContentVersion,
          round,
          targetAuthorId,
          qualifiedReporters: [],
          status: REPORT_TARGET_STATUSES.TARGET_REMOVED,
          caseId: null,
        }).save({ session });
        return;
      }
      if (state.status === REPORT_TARGET_STATUSES.COLLECTING) {
        state.status = REPORT_TARGET_STATUSES.TARGET_REMOVED;
        await state.save({ session });
      }
      return;
    }
    if (state?.status === REPORT_TARGET_STATUSES.TARGET_REMOVED && state.caseId === null) {
      state.status = REPORT_TARGET_STATUSES.COLLECTING;
      await state.save({ session });
    }
  }

  async listCircles(dto: ListAdminCirclesDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where: FilterQuery<Circle> = { deletedAt: null };
    if (dto.search?.trim()) where.$text = { $search: buildSearchText(dto.search.trim()) };
    const [items, total] = await Promise.all([
      this.circleModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.circleModel.countDocuments(where),
    ]);
    return { items, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }

  async createCircle(admin: AdminPrincipal, dto: CreateAdminCircleDto) {
    const result = await this.databaseService.$transaction(async (session) => {
      const circle = await this.circleService.createCircleForAdmin(dto, session);
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.CIRCLE_CREATED,
        targetType: 'CIRCLE',
        targetId: circle.id,
        reason: null,
        changes: { kind: circle.kind },
        session,
      });
      return this.circleService.serializeCircleForAdmin(circle);
    });
    return result;
  }

  async getCircleDetail(circleId: string) {
    return this.circleService.getCircleForAdmin(circleId);
  }

  async updateCircle(admin: AdminPrincipal, circleId: string, dto: UpdateAdminCircleDto) {
    if (dto.topic === undefined && dto.rules === undefined) {
      throw adminErrors.circleUpdateRequired();
    }
    return this.databaseService.$transaction(async (session) => {
      const before = await this.circleService.getCircleForAdmin(circleId, session);
      const normalizedTopic =
        dto.topic === undefined ? undefined : normalizeCircleVisibleText(dto.topic.value);
      const normalizedRules = dto.rules?.value.map((rule) => ({
        id: rule.id.trim(),
        text: rule.text.trim(),
      }));
      const topicChanged = normalizedTopic !== undefined && normalizedTopic !== before.topic;
      const rulesChanged =
        normalizedRules !== undefined &&
        (normalizedRules.length !== before.rules.length ||
          normalizedRules.some(
            (rule, index) =>
              rule.id !== before.rules[index]?.id || rule.text !== before.rules[index]?.text,
          ));
      if (!topicChanged && !rulesChanged) {
        throw circleErrors.unchanged();
      }
      const moderated = [];
      if (topicChanged) {
        const proposal = await this.circleProposalService.moderateActiveScopeForAdmin(
          circleId,
          'TOPIC',
          dto.reason,
          session,
        );
        if (proposal) moderated.push(proposal);
      }
      if (rulesChanged) {
        const proposal = await this.circleProposalService.moderateActiveScopeForAdmin(
          circleId,
          'RULES',
          dto.reason,
          session,
        );
        if (proposal) moderated.push(proposal);
      }
      for (const proposal of moderated) {
        await this.circleService.recordProposalModerationForAdmin(proposal, dto.reason, session);
      }
      const circle = await this.circleService.updateCircleForAdmin(
        circleId,
        {
          topic: topicChanged ? dto.topic : undefined,
          rules: rulesChanged ? dto.rules : undefined,
          reason: dto.reason,
        },
        session,
      );
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.CIRCLE_UPDATED,
        targetType: 'CIRCLE',
        targetId: circle.id,
        reason: dto.reason,
        changes: {
          topic: topicChanged
            ? {
                previous: before.topic,
                next: circle.topic,
                previousVersion: before.topicVersion,
                nextVersion: circle.topicVersion,
              }
            : null,
          rules: rulesChanged
            ? {
                previous: before.rules.map((rule) => ({ id: rule.id, text: rule.text })),
                next: circle.rules.map((rule) => ({ id: rule.id, text: rule.text })),
                previousVersion: before.rulesVersion,
                nextVersion: circle.rulesVersion,
              }
            : null,
          moderatedProposals: moderated.map((proposal) => ({
            id: proposal.id,
            scope: proposal.scope,
            status: proposal.status,
          })),
        },
        session,
      });
      return this.circleService.serializeCircleForAdmin(circle);
    });
  }

  async setCircleBanned(
    admin: AdminPrincipal,
    circleId: string,
    banned: boolean,
    publicReason: string,
  ) {
    const result = await this.databaseService.$transaction(async (session) => {
      const moderated = [];
      if (banned) {
        moderated.push(
          await this.circleProposalService.moderateActiveScopeForAdmin(
            circleId,
            'TOPIC',
            publicReason,
            session,
          ),
        );
        moderated.push(
          await this.circleProposalService.moderateActiveScopeForAdmin(
            circleId,
            'RULES',
            publicReason,
            session,
          ),
        );
      }
      for (const proposal of moderated) {
        if (proposal) {
          await this.circleService.recordProposalModerationForAdmin(
            proposal,
            publicReason,
            session,
          );
        }
      }
      const circle = await this.circleService.setCircleStatusForAdmin(
        circleId,
        banned ? 'BANNED' : 'ACTIVE',
        publicReason,
        session,
      );
      await this.auditService.record({
        actorUserId: admin.userId,
        action: banned ? ADMIN_AUDIT_ACTIONS.CIRCLE_BANNED : ADMIN_AUDIT_ACTIONS.CIRCLE_UNBANNED,
        targetType: 'CIRCLE',
        targetId: circle.id,
        reason: publicReason,
        changes: { status: circle.status },
        session,
      });
      return this.circleService.serializeCircleForAdmin(circle);
    });
    return result;
  }

  async moderateCircleProposal(
    admin: AdminPrincipal,
    circleId: string,
    proposalId: string,
    publicReason: string,
  ) {
    return this.databaseService.$transaction(async (session) => {
      const proposal = await this.circleProposalService.moderateProposalForAdmin(
        circleId,
        proposalId,
        publicReason,
        session,
      );
      await this.circleService.recordProposalModerationForAdmin(proposal, publicReason, session);
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.CIRCLE_PROPOSAL_MODERATED,
        targetType: 'CIRCLE_PROPOSAL',
        targetId: proposal.id,
        reason: publicReason,
        changes: { circleId, scope: proposal.scope },
        session,
      });
      return { id: proposal.id, status: proposal.status };
    });
  }

  async listGovernanceCases(dto: ListAdminGovernanceDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where: FilterQuery<GovernanceCase> = {};
    if (dto.status === 'PENDING') where.status = { $in: ['OPEN', 'EMERGENCY'] };
    else if (dto.status === 'RESOLVED') {
      where.status = { $in: ['RESOLVED_VIOLATION', 'RESOLVED_NOT_VIOLATION'] };
    } else if (dto.status) where.status = dto.status;
    const [items, total] = await Promise.all([
      this.governanceCaseModel
        .find(where)
        .sort({ openedAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.governanceCaseModel.countDocuments(where),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        targetSummary: this.getGovernanceTargetSummary(item),
        deadlineAt: (item.status === 'EMERGENCY'
          ? item.emergencyDeadlineAt
          : item.normalDeadlineAt
        ).toISOString(),
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getGovernanceCaseDetail(caseId: string) {
    ensureObjectId(caseId, governanceErrors.caseNotFound);
    const governanceCase = await this.governanceCaseModel.findById(caseId);
    if (!governanceCase) throw governanceErrors.caseNotFound();
    const [reports, votes, corrections] = await Promise.all([
      this.reportModel
        .find({
          targetType: governanceCase.targetType,
          targetId: governanceCase.targetId,
          targetContentVersion: governanceCase.targetContentVersion,
          round: governanceCase.round,
        })
        .sort({ createdAt: 1, _id: 1 }),
      this.governanceVoteModel.find({ caseId: governanceCase.id }).sort({ createdAt: 1, _id: 1 }),
      this.governanceCorrectionModel
        .find({ caseId: governanceCase.id })
        .sort({ createdAt: 1, _id: 1 }),
    ]);
    return {
      id: governanceCase.id,
      targetType: governanceCase.targetType,
      targetId: governanceCase.targetId,
      targetContentVersion: governanceCase.targetContentVersion,
      round: governanceCase.round,
      status: governanceCase.status,
      targetSummary: this.getGovernanceTargetSummary(governanceCase),
      targetSnapshot: governanceCase.targetSnapshot,
      triggerScore: governanceCase.triggerScore,
      triggerThreshold: governanceCase.triggerThreshold,
      tally: {
        violation: governanceCase.violationTally,
        notViolation: governanceCase.notViolationTally,
        participantCount: votes.length,
      },
      reports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        evidence: report.evidence,
        createdAt: report.createdAt.toISOString(),
      })),
      votes: votes.map((vote) => ({
        choice: vote.choice,
        weight: vote.weight,
        createdAt: vote.createdAt.toISOString(),
      })),
      openedAt: governanceCase.openedAt.toISOString(),
      firstReviewAt: governanceCase.firstReviewAt.toISOString(),
      normalDeadlineAt: governanceCase.normalDeadlineAt.toISOString(),
      emergencyDeadlineAt: governanceCase.emergencyDeadlineAt.toISOString(),
      deadlineAt: (governanceCase.status === 'EMERGENCY'
        ? governanceCase.emergencyDeadlineAt
        : governanceCase.normalDeadlineAt
      ).toISOString(),
      resolvedAt: governanceCase.resolvedAt?.toISOString() ?? null,
      resolutionSource: governanceCase.resolutionSource,
      resolutionReason: governanceCase.resolutionReason,
      corrections: corrections.map((correction) => ({
        id: correction.id,
        action: correction.action,
        publicReason: correction.publicReason,
        previousRound: correction.previousRound,
        nextRound: correction.nextRound,
        createdAt: correction.createdAt.toISOString(),
      })),
    };
  }

  async decideGovernanceCase(
    admin: AdminPrincipal,
    caseId: string,
    dto: AdminGovernanceDecisionDto,
  ) {
    const reason = dto.reason.trim();
    const result = await this.databaseService.$transaction(async (session) => {
      const governanceCase = await this.governanceService.resolveCaseForAdmin(
        caseId,
        dto.decision,
        reason,
        admin.userId,
        session,
      );
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.GOVERNANCE_CASE_ADJUDICATED,
        targetType: 'GOVERNANCE_CASE',
        targetId: governanceCase.id,
        reason,
        changes: { decision: dto.decision },
        session,
      });
      return {
        id: governanceCase.id,
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        status: governanceCase.status,
        resolutionSource: governanceCase.resolutionSource,
        resolutionReason: governanceCase.resolutionReason,
        resolvedAt: governanceCase.resolvedAt?.toISOString() ?? null,
      };
    });
    return {
      id: result.id,
      status: result.status,
      resolutionSource: result.resolutionSource,
      resolutionReason: result.resolutionReason,
      resolvedAt: result.resolvedAt,
    };
  }

  async correctGovernanceCase(admin: AdminPrincipal, caseId: string, reason: string) {
    const result = await this.databaseService.$transaction(async (session) => {
      const correction = await this.governanceService.restoreGovernanceRemovedContentForAdmin(
        caseId,
        reason.trim(),
        admin.userId,
        session,
      );
      const governanceCase = await this.governanceCaseModel.findById(caseId, null, { session });
      if (!governanceCase) throw new Error('治理纠正完成后案件记录缺失');
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.GOVERNANCE_CASE_CORRECTED,
        targetType: 'GOVERNANCE_CASE',
        targetId: caseId,
        reason,
        changes: {
          correctionId: correction.id,
          action: correction.action,
          previousRound: correction.previousRound,
          nextRound: correction.nextRound,
          contentRestored: true,
        },
        session,
      });
      return {
        id: correction.id,
        caseId: correction.caseId,
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        action: correction.action,
        publicReason: correction.publicReason,
        previousRound: correction.previousRound,
        nextRound: correction.nextRound,
        createdAt: correction.createdAt.toISOString(),
      };
    });
    return {
      id: result.id,
      caseId: result.caseId,
      action: result.action,
      publicReason: result.publicReason,
      previousRound: result.previousRound,
      nextRound: result.nextRound,
      createdAt: result.createdAt,
    };
  }

  private getGovernanceTargetSummary(governanceCase: GovernanceCase) {
    const snapshot = governanceCase.targetSnapshot;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.POST) {
      return {
        title: snapshot.post.title,
        excerpt: snapshot.post.content.slice(0, 180),
        postId: snapshot.post.id,
      };
    }
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.REPLY) {
      return {
        title: snapshot.post.title,
        excerpt: snapshot.reply.content.slice(0, 180),
        postId: snapshot.post.id,
      };
    }
    if (snapshot.kind === 'CIRCLE_PROPOSAL') {
      return {
        title:
          snapshot.proposal.scope === 'TOPIC'
            ? translateApiText('api.labels.circleTopicProposal', 'Circle topic proposal')
            : translateApiText('api.labels.circleRulesProposal', 'Circle rules proposal'),
        excerpt: snapshot.proposal.reason.slice(0, 180),
      };
    }
    return {
      title: translateApiText('api.labels.circleProposalComment', 'Circle co-build comment'),
      excerpt: snapshot.comment.content.slice(0, 180),
    };
  }

  async listContentReviews(dto: ListContentReviewsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where: FilterQuery<ContentReviewRequest> = {};
    if (dto.type) where.type = dto.type;
    if (dto.status) where.status = dto.status;
    const [requests, total] = await Promise.all([
      this.contentReviewModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.contentReviewModel.countDocuments(where),
    ]);
    const agentIds = [...new Set(requests.map((request) => request.requesterAgentId))];
    const agents = await this.agentModel.find({ _id: { $in: agentIds } }).select('name avatarSeed');
    const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
    return {
      items: requests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        payload: request.payload,
        requester: {
          agentId: request.requesterAgentId,
          name:
            agentMap.get(request.requesterAgentId)?.name ??
            translateApiText('api.labels.offlineAgent', 'Offline Agent'),
          avatarSeed:
            agentMap.get(request.requesterAgentId)?.avatarSeed ??
            `deleted-${request.requesterAgentId}`,
        },
        decisionReason: request.decisionReason,
        decidedAt: request.decidedAt?.toISOString() ?? null,
        publishedTargetId: request.publishedTargetId,
        createdAt: request.createdAt.toISOString(),
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getContentReviewDetail(reviewId: string) {
    ensureObjectId(reviewId, adminErrors.contentReviewNotFound);
    const request = await this.contentReviewModel.findById(reviewId);
    if (!request) throw adminErrors.contentReviewNotFound();
    const requester = await this.agentModel
      .findById(request.requesterAgentId)
      .select('name avatarSeed');
    if (request.type === CONTENT_REVIEW_TYPES.POST && 'circleId' in request.payload) {
      const circle = await this.circleModel
        .findOne({ _id: request.payload.circleId, deletedAt: { $exists: true } })
        .select('name slug status');
      return {
        id: request.id,
        type: request.type,
        status: request.status,
        payload: request.payload,
        requester: {
          agentId: request.requesterAgentId,
          name: requester?.name ?? translateApiText('api.labels.offlineAgent', 'Offline Agent'),
          avatarSeed: requester?.avatarSeed ?? `deleted-${request.requesterAgentId}`,
        },
        circle: circle
          ? { id: circle.id, name: circle.name, slug: circle.slug, status: circle.status }
          : null,
        decisionReason: request.decisionReason,
        decidedAt: request.decidedAt?.toISOString() ?? null,
        publishedTargetId: request.publishedTargetId,
        createdAt: request.createdAt.toISOString(),
      };
    }
    const [duplicate, publishedCircle] = await Promise.all([
      'normalizedName' in request.payload
        ? this.circleModel
            .findOne({ normalizedName: request.payload.normalizedName, deletedAt: null })
            .select('name slug')
        : Promise.resolve(null),
      request.publishedTargetId
        ? this.circleModel
            .findOne({ _id: request.publishedTargetId, deletedAt: { $exists: true } })
            .select('name slug')
        : Promise.resolve(null),
    ]);
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      payload: request.payload,
      requester: {
        agentId: request.requesterAgentId,
        name: requester?.name ?? translateApiText('api.labels.offlineAgent', 'Offline Agent'),
        avatarSeed: requester?.avatarSeed ?? `deleted-${request.requesterAgentId}`,
      },
      duplicateCircle: duplicate
        ? { id: duplicate.id, name: duplicate.name, slug: duplicate.slug }
        : null,
      publishedCircle: publishedCircle
        ? { id: publishedCircle.id, name: publishedCircle.name, slug: publishedCircle.slug }
        : null,
      decisionReason: request.decisionReason,
      decidedAt: request.decidedAt?.toISOString() ?? null,
      publishedTargetId: request.publishedTargetId,
      createdAt: request.createdAt.toISOString(),
    };
  }

  async decideContentReview(admin: AdminPrincipal, reviewId: string, dto: DecideContentReviewDto) {
    ensureObjectId(reviewId, adminErrors.contentReviewNotFound);
    const reason = dto.reason?.trim() || null;
    if (dto.decision === 'REJECT' && (!reason || reason.length < 4)) {
      throw adminErrors.reviewRejectionReasonRequired();
    }
    const result = await this.databaseService.$transaction(async (session) => {
      const request = await this.contentReviewModel.findOne(
        { _id: reviewId, status: CONTENT_REVIEW_STATUSES.PENDING },
        null,
        { session },
      );
      if (!request) throw adminErrors.contentReviewAlreadyHandled();
      let publishedTargetId: string | null = null;
      if (dto.decision === 'APPROVE') {
        publishedTargetId =
          request.type === CONTENT_REVIEW_TYPES.POST
            ? await this.forumService.publishReviewedPost(request, session)
            : await this.circleService.publishReviewedCircle(request, session);
      }
      const status =
        dto.decision === 'APPROVE'
          ? CONTENT_REVIEW_STATUSES.APPROVED
          : CONTENT_REVIEW_STATUSES.REJECTED;
      request.status = status;
      request.decisionReason = reason;
      request.decidedByUserId = admin.userId;
      request.decidedAt = new Date();
      request.publishedTargetId = publishedTargetId;
      request.activeKey = null;
      request.pendingNameKey = null;
      await request.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action:
          dto.decision === 'APPROVE'
            ? ADMIN_AUDIT_ACTIONS.CONTENT_REVIEW_APPROVED
            : ADMIN_AUDIT_ACTIONS.CONTENT_REVIEW_REJECTED,
        targetType: 'CONTENT_REVIEW',
        targetId: request.id,
        reason,
        changes: { status, publishedTargetId },
        session,
      });
      return {
        id: request.id,
        type: request.type,
        status,
        decisionReason: reason,
        decidedAt: request.decidedAt.toISOString(),
        publishedTargetId,
      };
    });
    if (
      result.type === CONTENT_REVIEW_TYPES.CIRCLE &&
      result.status === CONTENT_REVIEW_STATUSES.APPROVED
    ) {
    }
    return result;
  }
}
