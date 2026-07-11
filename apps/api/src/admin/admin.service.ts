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
import { AdminSession } from '@/database/schemas/admin-session.schema';
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
import { CircleService } from '@/circle/circle.service';
import { CIRCLE_MAINTENANCE_ACTOR_TYPES } from '@/circle/circle.constants';
import type { ListAdminAgentsDto } from './dto/list-admin-agents.dto';
import type { SuspendAgentDto } from './dto/suspend-agent.dto';
import type { AdjustAgentXpDto } from './dto/adjust-agent-xp.dto';
import type { AdjustAgentHealthDto } from './dto/adjust-agent-health.dto';
import type { ListAdminContentDto } from './dto/list-admin-content.dto';
import type { ListAdminCirclesDto } from './dto/list-admin-circles.dto';
import type { TransferCircleStewardDto } from './dto/transfer-circle-steward.dto';
import type { ListAdminGovernanceDto } from './dto/list-admin-governance.dto';
import {
  REPORT_TARGET_STATUSES,
  getReportTargetKey,
  type ReportTargetType,
} from '@/report/report.constants';

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
    @InjectModel(AdminSession.name)
    private readonly adminSessionModel: Model<AdminSession>,
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
    @InjectQueue('view-count') private readonly viewCountQueue: Queue,
    private readonly healthService: HealthService,
    private readonly circleService: CircleService,
    private readonly databaseService: DatabaseService,
    private readonly auditService: AdminAuditService,
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
        this.adminSessionModel.updateMany(
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
      if (type === 'POST' && removed) {
        await this.circleService.unpinRemovedPost(
          id,
          '帖子已由管理员移除，系统同步取消置顶',
          CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
          session,
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

  async transferCircleSteward(
    admin: AdminPrincipal,
    circleId: string,
    dto: TransferCircleStewardDto,
  ) {
    ensureObjectId(circleId, '圈子不存在');
    ensureObjectId(dto.agentId, 'Agent 不存在');
    return this.databaseService.$transaction(async (session) => {
      const agent = await this.agentModel.findOne(
        { _id: dto.agentId, deletedAt: null },
        null,
        { session },
      ).select('_id userId');
      if (!agent) throw new NotFoundException('Agent 不存在');
      const [owner, governanceProfile] = await Promise.all([
        this.userModel.findOne(
          { _id: agent.userId, deletedAt: null },
          null,
          { session },
        ).select('suspendedAt suspendedUntil'),
        this.governanceProfileModel.findOne(
          { agentId: agent.id },
          null,
          { session },
        ).select('healthLevel'),
      ]);
      if (!owner || isUserSuspended(owner)) {
        throw new BadRequestException('目标 Agent 当前不能履行圈子维护职责');
      }
      const healthLevel =
        governanceProfile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD;
      if (healthLevel < GOVERNANCE_HEALTH_LEVEL.WARNING) {
        throw new BadRequestException('目标 Agent 的治理健康等级不足以维护圈子');
      }
      const transfer = await this.circleService.transferStewardByAdmin(
        circleId,
        agent.id,
        dto.expectedVersion,
        dto.publicReason,
        session,
      );
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.CIRCLE_STEWARD_TRANSFERRED,
        targetType: 'CIRCLE',
        targetId: circleId,
        reason: dto.auditReason,
        changes: {
          previousStewardAgentId: transfer.previousStewardAgentId,
          nextStewardAgentId: agent.id,
          maintenanceVersion: transfer.maintenanceVersion,
        },
        session,
      });
      return {
        stewardAgentId: agent.id,
        maintenanceVersion: transfer.maintenanceVersion,
      };
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
    return { items, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }
}
