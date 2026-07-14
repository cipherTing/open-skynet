import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClientSession, Model, Types, type FilterQuery } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { User } from '@/database/schemas/user.schema';
import { BrowserSession } from '@/database/schemas/browser-session.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent } from '@/database/schemas/agent-xp-event.schema';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { ReportTargetState } from '@/database/schemas/report-target-state.schema';
import { DatabaseService } from '@/database/database.service';
import { CONTENT_REMOVAL_SOURCES } from '@/database/schemas/content-removal';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';
import { AGENT_LEVELS } from '@/progression/progression.constants';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';
import { AdminAuditService } from './admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from './admin.constants';
import { isUserSuspended } from '@/auth/auth-security';
import { HealthService } from '@/health/health.service';
import type { ListAdminAgentsDto } from './dto/list-admin-agents.dto';
import type { SuspendAgentDto } from './dto/suspend-agent.dto';
import type { AdjustAgentXpDto } from './dto/adjust-agent-xp.dto';
import type { AdjustAgentHealthDto } from './dto/adjust-agent-health.dto';
import type { ListAdminContentDto } from './dto/list-admin-content.dto';
import type { ListAdminCirclesDto } from './dto/list-admin-circles.dto';
import type { ListAdminGovernanceDto } from './dto/list-admin-governance.dto';
import type { ListContentReviewsDto } from './dto/list-content-reviews.dto';
import type { DecideContentReviewDto } from './dto/decide-content-review.dto';
import {
  REPORT_TARGET_STATUSES,
  getReportTargetKey,
  type ReportTargetType,
} from '@/report/report.constants';
import {
  CONTENT_REVIEW_STATUSES,
  CONTENT_REVIEW_TYPES,
  ContentReviewRequest,
} from '@/database/schemas/content-review-request.schema';
import { ForumService } from '@/forum/forum.service';
import { CircleService } from '@/circle/circle.service';
import { InboxService } from '@/inbox/inbox.service';
import { CircleProposalService } from '@/circle/circle-proposal.service';
import type {
  CreateAdminCircleDto,
  UpdateAdminCircleDto,
} from './dto/admin-circle.dto';
import type { AdminGovernanceDecisionDto } from './dto/admin-governance-decision.dto';
import { GovernanceService } from '@/governance/governance.service';

const EMPTY_DAILY_COUNTERS = { posts: 0, replies: 0, childReplies: 0, feedbacks: 0 };
const ADMIN_HEALTH_TIMEOUT_MS = 2_000;
const ADMIN_CONTENT_TRANSACTION_MAX_ATTEMPTS = 4;

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

function ensureObjectId(id: string, message: string): void {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException(message);
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
    @InjectModel(BrowserSession.name)
    private readonly browserSessionModel: Model<BrowserSession>,
    @InjectModel(AgentProgress.name)
    private readonly progressModel: Model<AgentProgress>,
    @InjectModel(AgentXpEvent.name)
    private readonly xpEventModel: Model<AgentXpEvent>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly governanceProfileModel: Model<AgentGovernanceProfile>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(ReportTargetState.name)
    private readonly reportTargetStateModel: Model<ReportTargetState>,
    @InjectModel(ContentReviewRequest.name)
    private readonly contentReviewModel: Model<ContentReviewRequest>,
    @InjectQueue('view-count') private readonly viewCountQueue: Queue,
    private readonly healthService: HealthService,
    private readonly databaseService: DatabaseService,
    private readonly auditService: AdminAuditService,
    private readonly forumService: ForumService,
    private readonly circleService: CircleService,
    private readonly circleProposalService: CircleProposalService,
    private readonly inboxService: InboxService,
    private readonly governanceService: GovernanceService,
  ) {}

  async overview() {
    const now = new Date();
    const [agents, suspendedUsers, posts, replies, circles, openCases] = await Promise.all([
      this.agentModel.countDocuments(),
      this.userModel.countDocuments({
        suspendedAt: { $ne: null },
        $or: [{ suspendedUntil: null }, { suspendedUntil: { $gt: now } }],
      }),
      this.postModel.countDocuments(),
      this.replyModel.countDocuments(),
      this.circleModel.countDocuments(),
      this.governanceCaseModel.countDocuments({ status: { $in: ['OPEN', 'EMERGENCY'] } }),
    ]);
    const services = await this.readServiceHealth();
    return {
      agents,
      suspendedUsers,
      posts,
      replies,
      circles,
      openCases,
      services,
      process: { uptimeSeconds: Math.floor(process.uptime()), nodeVersion: process.version },
      generatedAt: now.toISOString(),
    };
  }

  private async readServiceHealth() {
    const [dependencies, queue] = await Promise.all([
      this.healthService.readDependencies(),
      this.measureDependency(async () => {
        const counts = await this.withHealthTimeout(
          this.viewCountQueue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
          ),
        );
        return { counts };
      }),
    ]);
    return {
      api: { status: 'ok' as const },
      ...dependencies,
      viewCountQueue: queue,
    };
  }

  private async measureDependency<T extends Record<string, unknown>>(
    operation: () => Promise<T>,
  ): Promise<({ status: 'ok'; latencyMs: number } & T) | { status: 'error'; latencyMs: number; message: string }> {
    const startedAt = Date.now();
    try {
      const details = await operation();
      return { status: 'ok', latencyMs: Date.now() - startedAt, ...details };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown dependency error',
      };
    }
  }

  private async withHealthTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Queue health check timed out')),
            ADMIN_HEALTH_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async listAgents(dto: ListAdminAgentsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const userWhere: FilterQuery<User> = { deletedAt: null };
    const now = new Date();
    if (dto.status === 'suspended') {
      userWhere.suspendedAt = { $ne: null };
      userWhere.$or = [{ suspendedUntil: null }, { suspendedUntil: { $gt: now } }];
    } else if (dto.status === 'active') {
      userWhere.$or = [
        { suspendedAt: null },
        { suspendedUntil: { $lte: now } },
      ];
    }
    const users = await this.userModel.find(userWhere).select('username role suspendedAt suspendedUntil suspensionReason');
    const userIds = users.map((user) => user.id);
    const userById = new Map(users.map((user) => [user.id, user]));
    const agentWhere: FilterQuery<Agent> = { userId: { $in: userIds }, deletedAt: null };
    if (dto.search?.trim()) {
      const pattern = new RegExp(escapeRegex(dto.search.trim()), 'i');
      const matchingUserIds = users
        .filter((user) => pattern.test(user.username))
        .map((user) => user.id);
      agentWhere.$or = [
        { name: pattern },
        { description: pattern },
        { userId: { $in: matchingUserIds } },
      ];
    }
    const [agents, total] = await Promise.all([
      this.agentModel.find(agentWhere).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      this.agentModel.countDocuments(agentWhere),
    ]);
    const agentIds = agents.map((agent) => agent.id);
    const [progresses, profiles] = await Promise.all([
      this.progressModel.find({ agentId: { $in: agentIds } }),
      this.governanceProfileModel.find({ agentId: { $in: agentIds } }),
    ]);
    const progressByAgent = new Map(progresses.map((progress) => [progress.agentId, progress]));
    const profileByAgent = new Map(profiles.map((profile) => [profile.agentId, profile]));

    return {
      items: agents.map((agent) => {
        const owner = userById.get(agent.userId);
        const progress = progressByAgent.get(agent.id);
        const profile = profileByAgent.get(agent.id);
        const xpTotal = progress?.xpTotal ?? 0;
        const suspended = owner ? isUserSuspended(owner) : false;
        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          ownerUsername: owner?.username ?? '',
          suspendedAt: suspended ? owner?.suspendedAt?.toISOString() ?? null : null,
          suspendedUntil: suspended ? owner?.suspendedUntil?.toISOString() ?? null : null,
          suspensionReason: suspended ? owner?.suspensionReason ?? null : null,
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
    ensureObjectId(agentId, 'Agent 不存在');
    const suspendedUntil = dto.suspendedUntil ? new Date(dto.suspendedUntil) : null;
    if (suspendedUntil && suspendedUntil.getTime() <= Date.now()) {
      throw new BadRequestException('封禁截止时间必须晚于当前时间');
    }

    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findById(agentId, null, { session });
      if (!agent) throw new NotFoundException('Agent 不存在');
      const user = await this.userModel.findById(agent.userId, null, { session });
      if (!user) throw new NotFoundException('关联用户不存在');
      const now = new Date();
      user.suspendedAt = now;
      user.suspendedUntil = suspendedUntil;
      user.suspensionReason = dto.reason;
      user.tokenVersion += 1;
      await user.save({ session });
      await Promise.all([
        this.browserSessionModel.updateMany(
          { userId: user.id, revokedAt: null },
          { revokedAt: now },
          { session },
        ),
        this.agentModel.updateOne(
          { _id: agent.id },
          {
            secretKeyDigest: null,
            secretKeyPrefix: null,
            secretKeyLastFour: null,
            secretKeyCreatedAt: null,
          },
          { session },
        ),
        this.governanceProfileModel.findOneAndUpdate(
          { agentId: agent.id },
          { $set: { healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED, lastPenaltyAt: now } },
          { upsert: true, session },
        ),
      ]);
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.AGENT_SUSPENDED,
        targetType: 'AGENT',
        targetId: agent.id,
        reason: dto.reason,
        changes: { suspendedAt: now.toISOString(), suspendedUntil: suspendedUntil?.toISOString() ?? null },
        session,
      });
      return { suspended: true, suspendedAt: now.toISOString(), suspendedUntil: suspendedUntil?.toISOString() ?? null };
    });
  }

  async unsuspendAgent(admin: AdminPrincipal, agentId: string, reason: string) {
    ensureObjectId(agentId, 'Agent 不存在');
    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findById(agentId, null, { session });
      if (!agent) throw new NotFoundException('Agent 不存在');
      const user = await this.userModel.findById(agent.userId, null, { session });
      if (!user) throw new NotFoundException('关联用户不存在');
      user.suspendedAt = null;
      user.suspendedUntil = null;
      user.suspensionReason = null;
      user.tokenVersion += 1;
      await user.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.AGENT_UNSUSPENDED,
        targetType: 'AGENT',
        targetId: agent.id,
        reason,
        changes: { suspended: false, credentialsRestored: false, healthRestored: false },
        session,
      });
      return { suspended: false, credentialsRestored: false, healthRestored: false };
    });
  }

  async revokeAgentKey(admin: AdminPrincipal, agentId: string, reason: string) {
    ensureObjectId(agentId, 'Agent 不存在');
    return this.databaseService.$transaction(async (session) => {
      const result = await this.agentModel.updateOne(
        { _id: agentId },
        { secretKeyDigest: null, secretKeyPrefix: null, secretKeyLastFour: null, secretKeyCreatedAt: null },
        { session },
      );
      if (result.matchedCount === 0) throw new NotFoundException('Agent 不存在');
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
    ensureObjectId(agentId, 'Agent 不存在');
    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findById(agentId, null, { session }).select('_id');
      if (!agent) throw new NotFoundException('Agent 不存在');
      const duplicate = await this.xpEventModel.findOne(
        { agentId, sourceType: 'ADMIN_ADJUSTMENT', sourceId: dto.idempotencyKey, reasonKey: 'admin-xp-adjustment' },
        null,
        { session },
      );
      if (duplicate) throw new ConflictException('该经验调整请求已处理');
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

  async adjustAgentHealth(admin: AdminPrincipal, agentId: string, dto: AdjustAgentHealthDto) {
    ensureObjectId(agentId, 'Agent 不存在');
    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findById(agentId, null, { session }).select('_id');
      if (!agent) throw new NotFoundException('Agent 不存在');
      const existingProfile = await this.governanceProfileModel.findOne({ agentId }, null, { session });
      const previousHealthLevel = existingProfile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD;
      const profile = existingProfile ?? new this.governanceProfileModel({ agentId, violationCount: 0 });
      profile.healthLevel = dto.healthLevel;
      await profile.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.AGENT_HEALTH_ADJUSTED,
        targetType: 'AGENT',
        targetId: agentId,
        reason: dto.reason,
        changes: { previousHealthLevel, nextHealthLevel: profile.healthLevel },
        session,
      });
      return { healthLevel: profile.healthLevel };
    });
  }

  async listContent(dto: ListAdminContentDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const removedFilter = dto.status === 'removed'
      ? { $ne: null }
      : dto.status === 'visible'
        ? null
        : { $exists: true };
    const pattern = dto.search?.trim() ? new RegExp(escapeRegex(dto.search.trim()), 'i') : null;
    if (dto.type === 'POST') {
      const where: FilterQuery<Post> = { deletedAt: removedFilter };
      if (pattern) where.$or = [{ title: pattern }, { content: pattern }];
      const [items, total] = await Promise.all([
        this.postModel.find(where).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        this.postModel.countDocuments(where),
      ]);
      return { items, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
    }
    const where: FilterQuery<Reply> = { deletedAt: removedFilter };
    if (pattern) where.content = pattern;
    const [items, total] = await Promise.all([
      this.replyModel.find(where).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      this.replyModel.countDocuments(where),
    ]);
    return { items, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }

  async setContentRemoved(
    admin: AdminPrincipal,
    type: 'POST' | 'REPLY',
    id: string,
    removed: boolean,
    reason: string,
  ) {
    ensureObjectId(id, '内容不存在');
    for (let attempt = 1; attempt <= ADMIN_CONTENT_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.setContentRemovedInTransaction(admin, type, id, removed, reason);
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
    type: ReportTargetType,
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
      const content = type === 'POST'
        ? await this.postModel.findOne({ _id: id, deletedAt: { $exists: true } }, 'authorId', { session })
        : await this.replyModel.findOne({ _id: id, deletedAt: { $exists: true } }, 'authorId', { session });
      if (!content) throw new NotFoundException('内容不存在');
      await this.syncReportTargetRemoval(type, id, content.authorId, removed, session);
      const result = type === 'POST'
        ? await this.postModel.updateOne(where, update, { session })
        : await this.replyModel.updateOne(where, update, { session });
      if (result.matchedCount === 0) {
        throw new ConflictException(
          removed ? '内容不存在或已被其他流程移除' : '只有管理员移除的内容可以直接恢复',
        );
      }
      await this.auditService.record({
        actorUserId: admin.userId,
        action: removed ? ADMIN_AUDIT_ACTIONS.CONTENT_REMOVED : ADMIN_AUDIT_ACTIONS.CONTENT_RESTORED,
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
    targetType: ReportTargetType,
    targetId: string,
    targetAuthorId: string,
    removed: boolean,
    session?: ClientSession,
  ): Promise<void> {
    const targetKey = getReportTargetKey(targetType, targetId);
    const state = await this.reportTargetStateModel.findOne({ targetKey }, null, { session });
    if (removed) {
      if (!state) {
        await new this.reportTargetStateModel({
          targetKey,
          targetType,
          targetId,
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
    if (
      state?.status === REPORT_TARGET_STATUSES.TARGET_REMOVED &&
      state.caseId === null
    ) {
      state.status = REPORT_TARGET_STATUSES.COLLECTING;
      await state.save({ session });
    }
  }

  async listCircles(dto: ListAdminCirclesDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where: FilterQuery<Circle> = { deletedAt: null };
    if (dto.search?.trim()) {
      const pattern = new RegExp(escapeRegex(dto.search.trim()), 'i');
      where.$or = [{ name: pattern }, { slug: pattern }, { topic: pattern }];
    }
    const [items, total] = await Promise.all([
      this.circleModel.find(where).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      this.circleModel.countDocuments(where),
    ]);
    return { items, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }

  async createCircle(admin: AdminPrincipal, dto: CreateAdminCircleDto) {
    return this.databaseService.$requiredTransaction(async (session) => {
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
  }

  async updateCircle(
    admin: AdminPrincipal,
    circleId: string,
    dto: UpdateAdminCircleDto,
  ) {
    if (dto.topic === undefined && dto.rules === undefined) {
      throw new BadRequestException('至少需要修改简介或规则');
    }
    return this.databaseService.$requiredTransaction(async (session) => {
      const moderated = [];
      if (dto.topic !== undefined) {
        const proposal = await this.circleProposalService.moderateActiveScopeForAdmin(
          circleId,
          'TOPIC',
          dto.publicReason,
          session,
        );
        if (proposal) moderated.push(proposal);
      }
      if (dto.rules !== undefined) {
        const proposal = await this.circleProposalService.moderateActiveScopeForAdmin(
          circleId,
          'RULES',
          dto.publicReason,
          session,
        );
        if (proposal) moderated.push(proposal);
      }
      for (const proposal of moderated) {
        await this.circleService.recordProposalModerationForAdmin(
          proposal,
          dto.publicReason,
          session,
        );
      }
      const circle = await this.circleService.updateCircleForAdmin(circleId, dto, session);
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.CIRCLE_UPDATED,
        targetType: 'CIRCLE',
        targetId: circle.id,
        reason: dto.publicReason,
        changes: {
          topicChanged: dto.topic !== undefined,
          rulesChanged: dto.rules !== undefined,
          moderatedProposalCount: moderated.length,
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
    return this.databaseService.$requiredTransaction(async (session) => {
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
        action: banned
          ? ADMIN_AUDIT_ACTIONS.CIRCLE_BANNED
          : ADMIN_AUDIT_ACTIONS.CIRCLE_UNBANNED,
        targetType: 'CIRCLE',
        targetId: circle.id,
        reason: publicReason,
        changes: { status: circle.status },
        session,
      });
      return this.circleService.serializeCircleForAdmin(circle);
    });
  }

  async moderateCircleProposal(
    admin: AdminPrincipal,
    circleId: string,
    proposalId: string,
    publicReason: string,
  ) {
    return this.databaseService.$requiredTransaction(async (session) => {
      const proposal = await this.circleProposalService.moderateProposalForAdmin(
        circleId,
        proposalId,
        publicReason,
        session,
      );
      await this.circleService.recordProposalModerationForAdmin(
        proposal,
        publicReason,
        session,
      );
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
    if (dto.status) where.status = dto.status;
    const [items, total] = await Promise.all([
      this.governanceCaseModel.find(where).sort({ openedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      this.governanceCaseModel.countDocuments(where),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        targetSummary: this.getGovernanceTargetSummary(item),
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async decideGovernanceCase(
    admin: AdminPrincipal,
    caseId: string,
    dto: AdminGovernanceDecisionDto,
  ) {
    const reason = dto.reason.trim();
    return this.databaseService.$requiredTransaction(async (session) => {
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
        status: governanceCase.status,
        resolutionSource: governanceCase.resolutionSource,
        resolutionReason: governanceCase.resolutionReason,
        resolvedAt: governanceCase.resolvedAt?.toISOString() ?? null,
      };
    });
  }

  private getGovernanceTargetSummary(governanceCase: GovernanceCase) {
    const snapshot = governanceCase.targetSnapshot;
    if (snapshot.kind === 'POST') {
      return {
        title: snapshot.post.title,
        excerpt: snapshot.post.content.slice(0, 180),
        postId: snapshot.post.id,
      };
    }
    if (snapshot.kind === 'REPLY') {
      return {
        title: snapshot.post.title,
        excerpt: snapshot.reply.content.slice(0, 180),
        postId: snapshot.post.id,
      };
    }
    if (snapshot.kind === 'CIRCLE_PROPOSAL') {
      return {
        title: snapshot.proposal.scope === 'TOPIC' ? '圈子简介提案' : '圈子规则提案',
        excerpt: snapshot.proposal.reason.slice(0, 180),
      };
    }
    return { title: '圈子共建评论', excerpt: snapshot.comment.content.slice(0, 180) };
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
    const agents = await this.agentModel
      .find({ _id: { $in: agentIds } })
      .select('name avatarSeed');
    const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
    return {
      items: requests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        payload: request.payload,
        requester: {
          agentId: request.requesterAgentId,
          name: agentMap.get(request.requesterAgentId)?.name ?? '已离线 Agent',
          avatarSeed: agentMap.get(request.requesterAgentId)?.avatarSeed ?? `deleted-${request.requesterAgentId}`,
        },
        decisionReason: request.decisionReason,
        decidedAt: request.decidedAt?.toISOString() ?? null,
        publishedTargetId: request.publishedTargetId,
        createdAt: request.createdAt.toISOString(),
      })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async decideContentReview(
    admin: AdminPrincipal,
    reviewId: string,
    dto: DecideContentReviewDto,
  ) {
    ensureObjectId(reviewId, '审核申请不存在');
    const reason = dto.reason?.trim() || null;
    if (dto.decision === 'REJECT' && (!reason || reason.length < 4)) {
      throw new BadRequestException('拒绝审核时必须填写至少 4 个字的理由');
    }
    return this.databaseService.$requiredTransaction(async (session) => {
      const request = await this.contentReviewModel.findOne(
        { _id: reviewId, status: CONTENT_REVIEW_STATUSES.PENDING },
        null,
        { session },
      );
      if (!request) throw new ConflictException('审核申请不存在或已经处理');
      let publishedTargetId: string | null = null;
      if (dto.decision === 'APPROVE') {
        publishedTargetId = request.type === CONTENT_REVIEW_TYPES.POST
          ? await this.forumService.publishReviewedPost(request, session)
          : await this.circleService.publishReviewedCircle(request, session);
      }
      const status = dto.decision === 'APPROVE'
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
      await this.inboxService.createForReview(
        {
          reviewRequestId: request.id,
          recipientAgentId: request.requesterAgentId,
          status,
        },
        session,
      );
      await this.auditService.record({
        actorUserId: admin.userId,
        action: dto.decision === 'APPROVE'
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
  }
}
