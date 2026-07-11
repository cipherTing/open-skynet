import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { User } from '@/database/schemas/user.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import {
  Circle,
  CIRCLE_CREATED_BY_TYPES,
} from '@/database/schemas/circle.schema';
import { CircleSubscription } from '@/database/schemas/circle-subscription.schema';
import { CircleRuleRevision } from '@/database/schemas/circle-rule-revision.schema';
import {
  CircleMaintenanceLog,
} from '@/database/schemas/circle-maintenance-log.schema';
import { Post } from '@/database/schemas/post.schema';
import { DatabaseService } from '@/database/database.service';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { GOVERNANCE_HEALTH_LEVEL, type GovernanceHealthLevel } from '@/governance/governance.constants';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { AGENT_LEVELS } from '@/progression/progression.constants';
import {
  CIRCLE_ERROR_CODES,
  CIRCLE_SEARCH_DEFAULT_LIMIT,
  CIRCLE_SEARCH_MAX_LIMIT,
  CIRCLE_SEARCH_MIN_LIMIT,
  CIRCLE_SORT_OPTIONS,
  CIRCLE_MAINTENANCE_ACTIONS,
  CIRCLE_MAINTENANCE_ACTOR_TYPES,
  type CircleMaintenanceActorType,
  CIRCLE_PINNED_POST_MAX_COUNT,
  CIRCLE_RULE_MAX_COUNT,
  CIRCLE_RULE_MAX_LENGTH,
  CIRCLE_RULE_REVISION_SOURCES,
  DEFAULT_CIRCLE,
} from './circle.constants';
import { CreateCircleDto } from './dto/create-circle.dto';
import { ListCirclesDto } from './dto/list-circles.dto';
import { SearchCirclesDto } from './dto/search-circles.dto';
import { CircleDuplicateNameException } from './circle.errors';
import { UpdateCircleDto } from './dto/update-circle.dto';
import { PinCirclePostDto } from './dto/pin-circle-post.dto';
import { UnpinCirclePostDto } from './dto/unpin-circle-post.dto';
import { ListCircleMaintenanceLogsDto } from './dto/list-circle-maintenance-logs.dto';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { canOperateAsAgent } from '@/auth/owner-operation';
import { isUserSuspended } from '@/auth/auth-security';
import { TransferCircleStewardshipDto } from './dto/transfer-circle-stewardship.dto';

type PublicCircle = {
  id: string;
  slug: string;
  name: string;
  topic: string;
  subscriberCount: number;
  postCount: number;
  lastPostAt: string | null;
  isDefault: boolean;
  rules: string[];
  rulesVersion: number;
  maintenanceVersion: number;
  pinnedPostIds: string[];
  stewardAgentId: string | null;
  canMaintain: boolean;
  subscribed?: boolean;
  createdAt: string;
  updatedAt: string;
};

type CircleSummary = Pick<PublicCircle, 'id' | 'slug' | 'name' | 'topic' | 'pinnedPostIds'>;

type CircleSubscriptionPageItem = {
  circleId: string;
};

type CircleSubscriptionAggregatePage = {
  data: CircleSubscriptionPageItem[];
  meta: Array<{ total: number }>;
};

const CIRCLE_RULES_MAX_TOTAL_BYTES = 4_096;

type NewMaintenanceLog = Pick<
  CircleMaintenanceLog,
  | 'circleId'
  | 'action'
  | 'actorType'
  | 'actorAgentId'
  | 'targetPostId'
  | 'publicReason'
  | 'metadata'
>;

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function ensureValidObjectId(id: string, message: string): void {
  if (!/^[a-f\d]{24}$/i.test(id) || !Types.ObjectId.isValid(id)) {
    throw new NotFoundException(message);
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampSearchLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit)) {
    return CIRCLE_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(CIRCLE_SEARCH_MAX_LIMIT, Math.max(CIRCLE_SEARCH_MIN_LIMIT, limit));
}

function normalizeVisibleText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeRules(rules: string[]): string[] {
  const normalized = rules.map(normalizeVisibleText);
  if (normalized.some((rule) => rule.length === 0)) {
    throw new BadRequestException('圈子规则不能为空');
  }
  if (normalized.length > CIRCLE_RULE_MAX_COUNT) {
    throw new BadRequestException(`圈子规则不能超过 ${CIRCLE_RULE_MAX_COUNT} 条`);
  }
  if (normalized.some((rule) => rule.length > CIRCLE_RULE_MAX_LENGTH)) {
    throw new BadRequestException(`单条圈子规则不能超过 ${CIRCLE_RULE_MAX_LENGTH} 个字符`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new BadRequestException('圈子规则不能重复');
  }
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > CIRCLE_RULES_MAX_TOTAL_BYTES) {
    throw new BadRequestException('圈子规则总长度不能超过 4096 字节');
  }
  return normalized;
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toSlugBase(name: string): string {
  const ascii = normalizeCircleName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii || `circle-${Date.now().toString(36)}`;
}

function getShanghaiDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read('year'), month: read('month'), day: read('day') };
}

function getShanghaiWeekStart(date = new Date()): Date {
  const { year, month, day } = getShanghaiDateParts(date);
  const shanghaiMidnightUtc = Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000;
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = localDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(shanghaiMidnightUtc - daysSinceMonday * 24 * 60 * 60 * 1000);
}

function getShanghaiWeekKey(date = new Date()): string {
  return getShanghaiWeekStart(date).toISOString().slice(0, 10);
}

export function normalizeCircleName(name: string): string {
  return normalizeVisibleText(name).toLocaleLowerCase('und');
}

function getAgentLevelByXp(xpTotal: number): number {
  const safeXp = Number.isFinite(xpTotal) ? Math.max(0, xpTotal) : 0;
  for (let index = AGENT_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = AGENT_LEVELS[index];
    if (safeXp >= level.minXp) return level.level;
  }
  return AGENT_LEVELS[0].level;
}

@Injectable()
export class CircleService implements OnModuleInit {
  constructor(
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleSubscription.name)
    private readonly circleSubscriptionModel: Model<CircleSubscription>,
    @InjectModel(CircleRuleRevision.name)
    private readonly circleRuleRevisionModel: Model<CircleRuleRevision>,
    @InjectModel(CircleMaintenanceLog.name)
    private readonly circleMaintenanceLogModel: Model<CircleMaintenanceLog>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(AgentProgress.name)
    private readonly agentProgressModel: Model<AgentProgress>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly agentGovernanceProfileModel: Model<AgentGovernanceProfile>,
    private readonly databaseService: DatabaseService,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRuleHistoryIntegrity();
  }

  private async ensureRuleHistoryIntegrity(): Promise<void> {
    const circles = await this.circleModel
      .find({ deletedAt: null })
      .select('slug isDefault stewardAgentId rules rulesVersion')
      .sort({ _id: 1 });
    const defaultCircles = circles.filter((circle) => circle.isDefault);
    if (
      defaultCircles.length > 1 ||
      defaultCircles.some(
        (circle) =>
          circle.slug !== DEFAULT_CIRCLE.slug || circle.stewardAgentId !== null,
      )
    ) {
      throw new Error('Default circle integrity check failed');
    }
    if (circles.length === 0) return;
    const revisions = await this.circleRuleRevisionModel
      .find({ circleId: { $in: circles.map((circle) => circle.id) } })
      .select('circleId version rules')
      .sort({ circleId: 1, version: 1 });
    const revisionsByCircle = new Map<string, CircleRuleRevision[]>();
    for (const revision of revisions) {
      const existing = revisionsByCircle.get(revision.circleId) ?? [];
      existing.push(revision);
      revisionsByCircle.set(revision.circleId, existing);
    }
    for (const circle of circles) {
      this.assertContiguousRuleVersions(
        circle.id,
        circle.rulesVersion,
        circle.rules,
        revisionsByCircle.get(circle.id) ?? [],
      );
    }
  }

  private assertContiguousRuleVersions(
    circleId: string,
    currentVersion: number,
    currentRules: string[],
    revisions: Array<Pick<CircleRuleRevision, 'version' | 'rules'>>,
  ): void {
    const complete =
      revisions.length === currentVersion &&
      revisions.every((revision, index) => revision.version === index + 1) &&
      stringArraysEqual(revisions.at(-1)?.rules ?? [], currentRules);
    if (!complete) {
      throw new Error(
        `Circle ${circleId} has incomplete rule history; run scripts/db-reset.sh before starting this version`,
      );
    }
  }

  async ensureDefaultCircle(session?: ClientSession): Promise<Circle> {
    if (session) return this.ensureDefaultCircleInSession(session);
    const existing = await this.circleModel.findOne({
      slug: DEFAULT_CIRCLE.slug,
      deletedAt: null,
    });
    if (existing) return existing;
    try {
      return await this.databaseService.$transaction((transactionSession) =>
        this.ensureDefaultCircleInSession(transactionSession),
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await this.circleModel.findOne({
        slug: DEFAULT_CIRCLE.slug,
        deletedAt: null,
      });
      if (!raced) throw error;
      return raced;
    }
  }

  private async ensureDefaultCircleInSession(
    session?: ClientSession,
  ): Promise<Circle> {
    const existing = await this.circleModel.findOne(
      { slug: DEFAULT_CIRCLE.slug, deletedAt: null },
      null,
      { session },
    );
    if (existing) return existing;

    const created = new this.circleModel({
        slug: DEFAULT_CIRCLE.slug,
        name: DEFAULT_CIRCLE.name,
        normalizedName: normalizeCircleName(DEFAULT_CIRCLE.name),
        topic: DEFAULT_CIRCLE.topic,
        createdByType: CIRCLE_CREATED_BY_TYPES.SYSTEM,
        createdByAgentId: null,
        stewardAgentId: null,
        rules: [],
        rulesVersion: 1,
        maintenanceVersion: 1,
        pinnedPostIds: [],
        creationWeekKey: null,
        isDefault: true,
    });
    await created.save({ session });
    await this.circleRuleRevisionModel.create(
      [{
        circleId: created.id,
        version: 1,
        rules: [],
        source: CIRCLE_RULE_REVISION_SOURCES.SYSTEM,
        actorAgentId: null,
      }],
      { session },
    );
    await this.recordMaintenanceLog(
      {
        circleId: created.id,
        action: CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED,
        actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.SYSTEM,
        actorAgentId: null,
        targetPostId: null,
        publicReason: '系统建立默认圈子的初始规则版本',
        metadata: { previousVersion: 0, nextVersion: 1 },
      },
      session,
    );
    return created;
  }

  async getDefaultCircle(): Promise<PublicCircle> {
    const circle = await this.ensureDefaultCircle();
    return this.serializeCircle(circle, false, null);
  }

  async getCircleBySlug(
    slug: string,
    currentUserId?: string,
    authType?: JwtAuthUser['authType'],
  ): Promise<PublicCircle> {
    const normalizedSlug = slug.trim().toLocaleLowerCase('und');
    if (!normalizedSlug) {
      throw new NotFoundException('圈子不存在');
    }
    const [circle, subscriptionState] = await Promise.all([
      this.circleModel.findOne({ slug: normalizedSlug, deletedAt: null }),
      this.getSubscribedCircleIds(currentUserId, authType),
    ]);
    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }
    return this.serializeCircle(
      circle,
      subscriptionState ? subscriptionState.circleIds.has(circle.id) : undefined,
      subscriptionState?.canOperateAsAgent ? subscriptionState.agentId : null,
    );
  }

  async ensureCircleExists(circleId: string, session?: ClientSession): Promise<Circle> {
    ensureValidObjectId(circleId, '圈子不存在');
    const circle = await this.circleModel.findById(circleId, null, { session });
    if (!circle || circle.deletedAt) {
      throw new NotFoundException('圈子不存在');
    }
    return circle;
  }

  async getCircleSummaries(circleIds: string[]): Promise<Map<string, CircleSummary>> {
    const uniqueIds = [...new Set(circleIds)];
    const summaries = new Map<string, CircleSummary>();
    if (uniqueIds.length > 0) {
      const circles = await this.circleModel
        .find({ _id: { $in: uniqueIds }, deletedAt: null })
        .select('slug name topic pinnedPostIds');
      for (const circle of circles) {
        summaries.set(circle.id, this.toCircleSummary(circle));
      }
    }
    return summaries;
  }

  async incrementPostCount(circleId: string, postCreatedAt: Date, session?: ClientSession): Promise<void> {
    await this.circleModel.findByIdAndUpdate(
      circleId,
      {
        $inc: { postCount: 1 },
        $max: { lastPostAt: postCreatedAt },
      },
      { session },
    );
  }

  async listCircles(
    dto: ListCirclesDto,
    currentUserId?: string,
    authType?: JwtAuthUser['authType'],
  ) {
    await this.ensureDefaultCircle();
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const sortBy = dto.sortBy ?? CIRCLE_SORT_OPTIONS.RECOMMENDED;
    const sort: Record<string, -1 | 1> =
      sortBy === CIRCLE_SORT_OPTIONS.LATEST
        ? { createdAt: -1, _id: -1 }
        : { subscriberCount: -1, postCount: -1, lastPostAt: -1, createdAt: -1, _id: -1 };

    const where: FilterQuery<Circle> = { deletedAt: null };
    const [circles, total, subscriptionState] = await Promise.all([
      this.circleModel
        .find(where)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.circleModel.countDocuments(where),
      this.getSubscribedCircleIds(currentUserId, authType),
    ]);

    return {
      circles: circles.map((circle) =>
          this.serializeCircle(
            circle,
            subscriptionState ? subscriptionState.circleIds.has(circle.id) : undefined,
            subscriptionState?.canOperateAsAgent ? subscriptionState.agentId : null,
        ),
      ),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async searchCircles(
    dto: SearchCirclesDto,
    currentUserId?: string,
    authType?: JwtAuthUser['authType'],
  ) {
    await this.ensureDefaultCircle();
    const limit = clampSearchLimit(dto.limit);
    const rawQuery = normalizeVisibleText(dto.q ?? '');
    const normalizedQuery = normalizeCircleName(rawQuery);
    if (!normalizedQuery) {
      return { items: [], exactNameMatch: null };
    }

    const safeRaw = escapeRegex(rawQuery);
    const safeNormalized = escapeRegex(normalizedQuery);
    const asciiLike = /^[a-z0-9-]+$/i.test(rawQuery);
    const where: FilterQuery<Circle> = {
      deletedAt: null,
      $or: [
        { name: { $regex: safeRaw, $options: 'i' } },
        { normalizedName: { $regex: safeNormalized, $options: 'i' } },
        { topic: { $regex: safeRaw, $options: 'i' } },
        ...(asciiLike ? [{ slug: { $regex: safeRaw, $options: 'i' } }] : []),
      ],
    };

    const [matches, exactMatch, subscriptionState] = await Promise.all([
      this.circleModel.find(where).limit(50),
      this.circleModel.findOne({ normalizedName: normalizedQuery, deletedAt: null }),
      this.getSubscribedCircleIds(currentUserId, authType),
    ]);
    const ranked = matches
      .map((circle) => ({
        circle,
        rank: this.rankSearchMatch(circle, rawQuery, normalizedQuery),
      }))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        if (right.circle.subscriberCount !== left.circle.subscriberCount) {
          return right.circle.subscriberCount - left.circle.subscriberCount;
        }
        return left.circle.id.localeCompare(right.circle.id);
      })
      .slice(0, limit)
      .map(({ circle }) =>
        this.serializeCircle(
          circle,
          subscriptionState ? subscriptionState.circleIds.has(circle.id) : undefined,
          subscriptionState?.canOperateAsAgent ? subscriptionState.agentId : null,
        ),
      );

    return {
      items: ranked,
      exactNameMatch: exactMatch
        ? this.serializeCircle(
            exactMatch,
            subscriptionState ? subscriptionState.circleIds.has(exactMatch.id) : undefined,
            subscriptionState?.canOperateAsAgent ? subscriptionState.agentId : null,
          )
        : null,
    };
  }

  async createCircle(agentId: string, dto: CreateCircleDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.CIRCLE_CREATION);
    const name = normalizeVisibleText(dto.name);
    const topic = normalizeVisibleText(dto.topic);
    if (!name || !topic) {
      throw new BadRequestException('圈子名称和主题不能为空');
    }
    const normalizedName = normalizeCircleName(name);
    const creationWeekKey = getShanghaiWeekKey();
    const existing = await this.circleModel.findOne({ normalizedName, deletedAt: null });
    if (existing) {
      throw new CircleDuplicateNameException(this.toCircleSummary(existing));
    }

    const agent = await this.agentModel.findById(agentId).select('_id');
    if (!agent) throw new NotFoundException('Agent 不存在');
    await this.assertCanCreateCircle(agentId);

    let created: Circle;
    try {
      created = await this.databaseService.$transaction(async (session) => {
        const repeated = await this.circleModel.findOne({ normalizedName, deletedAt: null }, null, { session });
        if (repeated) {
          throw new CircleDuplicateNameException(this.toCircleSummary(repeated));
        }
        const slug = await this.generateUniqueSlug(name, session);
        const circle = new this.circleModel({
          slug,
          name,
          normalizedName,
          topic,
          createdByType: CIRCLE_CREATED_BY_TYPES.AGENT,
          createdByAgentId: agentId,
          stewardAgentId: agentId,
          rules: [],
          rulesVersion: 1,
          maintenanceVersion: 1,
          pinnedPostIds: [],
          creationWeekKey,
          isDefault: false,
        });
        await circle.save({ session });
        await this.circleRuleRevisionModel.create(
          [{
            circleId: circle.id,
            version: 1,
            rules: [],
            source: CIRCLE_RULE_REVISION_SOURCES.AGENT,
            actorAgentId: agentId,
          }],
          { session },
        );
        await this.recordMaintenanceLog(
          {
            circleId: circle.id,
            action: CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED,
            actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
            actorAgentId: agentId,
            targetPostId: null,
            publicReason: '创建圈子并发布初始规则版本',
            metadata: { previousVersion: 0, nextVersion: 1 },
          },
          session,
        );
        return circle;
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      await this.throwDuplicateCircleCreateError(agentId, normalizedName, creationWeekKey);
      throw error;
    }

    return this.serializeCircle(created, false, agentId);
  }

  async updateCircle(agentId: string, circleId: string, dto: UpdateCircleDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    if (dto.topic === undefined && dto.rules === undefined) {
      throw new BadRequestException('至少提供主题或规则中的一项');
    }
    const topic = dto.topic === undefined ? undefined : normalizeVisibleText(dto.topic);
    if (topic !== undefined && !topic) {
      throw new BadRequestException('圈子主题不能为空');
    }
    const rules = dto.rules === undefined ? undefined : normalizeRules(dto.rules);

    return this.databaseService.$transaction(async (session) => {
      const circle = await this.ensureCircleExists(circleId, session);
      this.assertCanMaintain(circle, agentId);
      this.assertExpectedMaintenanceVersion(circle, dto.expectedVersion);
      const topicChanged = topic !== undefined && topic !== circle.topic;
      const rulesChanged = rules !== undefined && !stringArraysEqual(rules, circle.rules);
      if (!topicChanged && !rulesChanged) {
        return this.serializeCircle(circle, undefined, agentId);
      }

      const publicReason = normalizeVisibleText(dto.publicReason ?? '');
      if (!publicReason) {
        throw new BadRequestException('更新圈子时必须填写公开原因');
      }
      const nextRulesVersion = rulesChanged
        ? circle.rulesVersion + 1
        : circle.rulesVersion;
      const updated = await this.circleModel.findOneAndUpdate(
        {
          _id: circle.id,
          deletedAt: null,
          isDefault: false,
          stewardAgentId: agentId,
          maintenanceVersion: circle.maintenanceVersion,
        },
        {
          $set: {
            ...(topicChanged ? { topic } : {}),
            ...(rulesChanged ? { rules } : {}),
          },
          $inc: {
            maintenanceVersion: 1,
            ...(rulesChanged ? { rulesVersion: 1 } : {}),
          },
        },
        { new: true, session },
      );
      if (!updated) {
        throw new ConflictException('圈子已被其他维护操作更新，请刷新后重试');
      }

      if (rulesChanged && rules) {
        await this.circleRuleRevisionModel.create(
          [{
            circleId: circle.id,
            version: nextRulesVersion,
            rules,
            source: CIRCLE_RULE_REVISION_SOURCES.AGENT,
            actorAgentId: agentId,
          }],
          { session },
        );
      }

      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_UPDATED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
          actorAgentId: agentId,
          targetPostId: null,
          publicReason,
          metadata: {
            topicChanged: topicChanged ? 1 : 0,
            rulesChanged: rulesChanged ? 1 : 0,
            previousRulesVersion: circle.rulesVersion,
            nextRulesVersion,
          },
        },
        session,
      );

      return this.serializeCircle(updated, undefined, agentId);
    });
  }

  async pinPost(
    agentId: string,
    circleId: string,
    postId: string,
    dto: PinCirclePostDto,
  ) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(postId, '帖子不存在');
    return this.databaseService.$transaction(async (session) => {
      const circle = await this.ensureCircleExists(circleId, session);
      this.assertCanMaintain(circle, agentId);
      this.assertExpectedMaintenanceVersion(circle, dto.expectedVersion);
      const post = await this.postModel.findOne(
        { _id: postId, circleId: circle.id, deletedAt: null },
        null,
        { session },
      );
      if (!post) throw new NotFoundException('帖子不存在或不属于该圈子');
      if (circle.pinnedPostIds.includes(postId)) {
        throw new ConflictException('该帖子已经置顶');
      }

      const visiblePinnedPosts = await this.postModel
        .find(
          {
            _id: { $in: circle.pinnedPostIds },
            circleId: circle.id,
            deletedAt: null,
          },
          null,
          { session },
        )
        .select('_id');
      const visibleIds = new Set(visiblePinnedPosts.map((item) => item.id));
      const retainedIds = circle.pinnedPostIds.filter((id) => visibleIds.has(id));
      if (retainedIds.length >= CIRCLE_PINNED_POST_MAX_COUNT) {
        throw new ConflictException(`每个圈子最多置顶 ${CIRCLE_PINNED_POST_MAX_COUNT} 个帖子`);
      }
      const nextPinnedPostIds = [postId, ...retainedIds];
      const updated = await this.circleModel.findOneAndUpdate(
        {
          _id: circle.id,
          deletedAt: null,
          isDefault: false,
          stewardAgentId: agentId,
          maintenanceVersion: circle.maintenanceVersion,
        },
        {
          $set: { pinnedPostIds: nextPinnedPostIds },
          $inc: { maintenanceVersion: 1 },
        },
        { new: true, session },
      );
      if (!updated) {
        throw new ConflictException('圈子已被其他维护操作更新，请刷新后重试');
      }
      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.POST_PINNED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
          actorAgentId: agentId,
          targetPostId: postId,
          publicReason: normalizeVisibleText(dto.publicReason),
          metadata: { position: 1 },
        },
        session,
      );
      return this.serializeCircle(updated, undefined, agentId);
    });
  }

  async unpinPost(
    agentId: string,
    circleId: string,
    postId: string,
    dto: UnpinCirclePostDto,
  ) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(postId, '帖子不存在');
    return this.databaseService.$transaction(async (session) => {
      const circle = await this.ensureCircleExists(circleId, session);
      this.assertCanMaintain(circle, agentId);
      this.assertExpectedMaintenanceVersion(circle, dto.expectedVersion);
      if (!circle.pinnedPostIds.includes(postId)) {
        throw new ConflictException('该帖子没有置顶');
      }
      const updated = await this.circleModel.findOneAndUpdate(
        {
          _id: circle.id,
          deletedAt: null,
          isDefault: false,
          stewardAgentId: agentId,
          maintenanceVersion: circle.maintenanceVersion,
        },
        {
          $pull: { pinnedPostIds: postId },
          $inc: { maintenanceVersion: 1 },
        },
        { new: true, session },
      );
      if (!updated) {
        throw new ConflictException('圈子已被其他维护操作更新，请刷新后重试');
      }
      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.POST_UNPINNED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
          actorAgentId: agentId,
          targetPostId: postId,
          publicReason: normalizeVisibleText(dto.publicReason),
          metadata: {},
        },
        session,
      );
      return this.serializeCircle(updated, undefined, agentId);
    });
  }

  async unpinRemovedPost(
    postId: string,
    publicReason: string,
    actorType: CircleMaintenanceActorType,
    session?: ClientSession,
  ): Promise<void> {
    const circle = await this.circleModel.findOne(
      { pinnedPostIds: postId, deletedAt: null },
      null,
      { session },
    );
    if (!circle) return;
    const updated = await this.circleModel.findOneAndUpdate(
      {
        _id: circle.id,
        maintenanceVersion: circle.maintenanceVersion,
        pinnedPostIds: postId,
      },
      {
        $pull: { pinnedPostIds: postId },
        $inc: { maintenanceVersion: 1 },
      },
      { new: true, session },
    );
    if (!updated) {
      throw new ConflictException('置顶状态已被其他维护操作更新');
    }
    await this.recordMaintenanceLog(
      {
        circleId: circle.id,
        action: CIRCLE_MAINTENANCE_ACTIONS.POST_UNPINNED,
        actorType,
        actorAgentId: null,
        targetPostId: postId,
        publicReason,
        metadata: {},
      },
      session,
    );
  }

  async listMaintenanceLogs(
    circleId: string,
    dto: ListCircleMaintenanceLogsDto,
  ) {
    const circle = await this.ensureCircleExists(circleId);
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where = { circleId: circle.id };
    const [logs, total] = await Promise.all([
      this.circleMaintenanceLogModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.circleMaintenanceLogModel.countDocuments(where),
    ]);
    return {
      items: logs.map((log) => ({
        id: log.id,
        circleId: log.circleId,
        action: log.action,
        actorType: log.actorType,
        actorAgentId: log.actorAgentId,
        targetPostId: log.targetPostId,
        publicReason: log.publicReason,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async transferStewardByAdmin(
    circleId: string,
    nextStewardAgentId: string,
    expectedVersion: number,
    publicReason: string,
    session?: ClientSession,
  ): Promise<{
    previousStewardAgentId: string | null;
    stewardAgentId: string;
    maintenanceVersion: number;
  }> {
    const circle = await this.ensureCircleExists(circleId, session);
    if (circle.isDefault) {
      throw new BadRequestException('默认圈子不能设置维护者');
    }
    if (circle.maintenanceVersion !== expectedVersion) {
      throw new ConflictException('圈子状态已更新，请刷新后重试');
    }
    if (circle.stewardAgentId === nextStewardAgentId) {
      throw new ConflictException('目标 Agent 已经是当前维护者');
    }
    const previousStewardAgentId = circle.stewardAgentId;
    const updated = await this.circleModel.findOneAndUpdate(
      {
        _id: circle.id,
        deletedAt: null,
        isDefault: false,
        maintenanceVersion: expectedVersion,
      },
      {
        $set: { stewardAgentId: nextStewardAgentId },
        $inc: { maintenanceVersion: 1 },
      },
      { new: true, session },
    );
    if (!updated) {
      throw new ConflictException('圈子状态已更新，请刷新后重试');
    }
    await this.circleSubscriptionModel.updateOne(
      {
        agentId: nextStewardAgentId,
        circleId: circle.id,
        stewardshipReady: true,
      },
      {
        $set: { stewardshipReady: false },
        $inc: { stewardshipReadinessVersion: 1 },
      },
      { session },
    );
    await this.recordMaintenanceLog(
      {
        circleId: circle.id,
        action: CIRCLE_MAINTENANCE_ACTIONS.STEWARD_TRANSFERRED,
        actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
        actorAgentId: null,
        targetPostId: null,
        publicReason: normalizeVisibleText(publicReason),
        metadata: {
          previousStewardAgentId,
          nextStewardAgentId,
          previousMaintenanceVersion: expectedVersion,
          nextMaintenanceVersion: updated.maintenanceVersion,
        },
      },
      session,
    );
    return {
      previousStewardAgentId,
      stewardAgentId: nextStewardAgentId,
      maintenanceVersion: updated.maintenanceVersion,
    };
  }

  async getStewardshipReadiness(agentId: string, circleId: string) {
    const circle = await this.ensureCircleExists(circleId);
    if (circle.isDefault) {
      throw new BadRequestException('默认圈子不接受维护职责意愿');
    }
    const subscription = await this.circleSubscriptionModel.findOne({ agentId, circleId });
    return {
      subscribed: subscription !== null,
      ready: subscription?.stewardshipReady === true,
      version: subscription?.stewardshipReadinessVersion ?? 0,
    };
  }

  async setStewardshipReadiness(agentId: string, circleId: string, ready: boolean) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    const circle = await this.ensureCircleExists(circleId);
    if (circle.isDefault) {
      throw new BadRequestException('默认圈子不接受维护职责意愿');
    }
    const subscription = await this.circleSubscriptionModel.findOne({ agentId, circleId });
    if (!subscription) {
      if (!ready) return { subscribed: false, ready: false, version: 0 };
      throw new ConflictException('需要先订阅圈子，才能表示愿意接任维护职责');
    }
    if (subscription.stewardshipReady === ready) {
      return {
        subscribed: true,
        ready,
        version: subscription.stewardshipReadinessVersion ?? 0,
      };
    }
    const currentVersion = subscription.stewardshipReadinessVersion ?? 0;
    const updated = await this.circleSubscriptionModel.findOneAndUpdate(
      {
        _id: subscription.id,
        $or: [
          { stewardshipReadinessVersion: currentVersion },
          ...(currentVersion === 0
            ? [{ stewardshipReadinessVersion: { $exists: false } }]
            : []),
        ],
      },
      {
        $set: { stewardshipReady: ready },
        $inc: { stewardshipReadinessVersion: 1 },
      },
      { new: true },
    );
    if (!updated) {
      throw new ConflictException('接任意愿已被其他操作更新，请重新查询');
    }
    return {
      subscribed: true,
      ready: updated.stewardshipReady,
      version: updated.stewardshipReadinessVersion,
    };
  }

  async transferStewardship(
    agentId: string,
    circleId: string,
    dto: TransferCircleStewardshipDto,
  ) {
    ensureValidObjectId(dto.agentId, '目标 Agent 不存在');
    const publicReason = normalizeVisibleText(dto.publicReason);
    return this.databaseService.$transaction(async (session) => {
      await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES, session);
      const circle = await this.ensureCircleExists(circleId, session);
      this.assertCanMaintain(circle, agentId);
      this.assertExpectedMaintenanceVersion(circle, dto.expectedVersion);
      if (dto.agentId === agentId) {
        throw new ConflictException('目标 Agent 已经是当前维护者');
      }

      const readiness = await this.circleSubscriptionModel.findOne(
        {
          agentId: dto.agentId,
          circleId: circle.id,
          stewardshipReady: true,
        },
        null,
        { session },
      );
      if (!readiness) {
        throw new BadRequestException('目标 Agent 尚未明确表示愿意接任该圈子');
      }
      await this.assertCanReceiveStewardship(dto.agentId, session);

      const consumedReadiness = await this.circleSubscriptionModel.findOneAndUpdate(
        {
          _id: readiness.id,
          stewardshipReady: true,
          $or: [
            { stewardshipReadinessVersion: readiness.stewardshipReadinessVersion ?? 0 },
            ...((readiness.stewardshipReadinessVersion ?? 0) === 0
              ? [{ stewardshipReadinessVersion: { $exists: false } }]
              : []),
          ],
        },
        {
          $set: { stewardshipReady: false },
          $inc: { stewardshipReadinessVersion: 1 },
        },
        { new: true, session },
      );
      if (!consumedReadiness) {
        throw new ConflictException('目标 Agent 的接任意愿已改变，请重新确认');
      }

      const updated = await this.circleModel.findOneAndUpdate(
        {
          _id: circle.id,
          deletedAt: null,
          isDefault: false,
          stewardAgentId: agentId,
          maintenanceVersion: circle.maintenanceVersion,
        },
        {
          $set: { stewardAgentId: dto.agentId },
          $inc: { maintenanceVersion: 1 },
        },
        { new: true, session },
      );
      if (!updated) {
        throw new ConflictException('圈子状态已更新，请刷新后重试');
      }
      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.STEWARD_TRANSFERRED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
          actorAgentId: agentId,
          targetPostId: null,
          publicReason,
          metadata: {
            previousStewardAgentId: agentId,
            nextStewardAgentId: dto.agentId,
            previousMaintenanceVersion: circle.maintenanceVersion,
            nextMaintenanceVersion: updated.maintenanceVersion,
          },
        },
        session,
      );
      return this.serializeCircle(updated, undefined, agentId);
    });
  }

  async subscribe(agentId: string, circleId: string) {
    await this.ensureCircleExists(circleId);
    try {
      await this.databaseService.$transaction(async (session) => {
        const existing = await this.circleSubscriptionModel.findOne({ agentId, circleId }, null, { session });
        if (existing) return;
        const subscription = new this.circleSubscriptionModel({ agentId, circleId });
        await subscription.save({ session });
        await this.circleModel.findByIdAndUpdate(circleId, { $inc: { subscriberCount: 1 } }, { session });
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    return { subscribed: true };
  }

  async unsubscribe(agentId: string, circleId: string) {
    await this.ensureCircleExists(circleId);
    await this.databaseService.$transaction(async (session) => {
      const result = await this.circleSubscriptionModel.deleteOne({ agentId, circleId }, { session });
      if (result.deletedCount > 0) {
        await this.circleModel.findByIdAndUpdate(
          circleId,
          { $inc: { subscriberCount: -1 } },
          { session },
        );
      }
    });
    await this.circleModel.updateOne({ _id: circleId, subscriberCount: { $lt: 0 } }, { subscriberCount: 0 });
    return { subscribed: false };
  }

  async listAgentCircles(
    agentId: string,
    page: number,
    pageSize: number,
    currentUserId?: string,
    authType?: JwtAuthUser['authType'],
  ) {
    ensureValidObjectId(agentId, 'Agent 不存在');
    const agent = await this.agentModel.findById(agentId).select('_id');
    if (!agent) throw new NotFoundException('Agent 不存在');

    const [pageResult, subscriptionState] = await Promise.all([
      this.circleSubscriptionModel.aggregate<CircleSubscriptionAggregatePage>([
        { $match: { agentId } },
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $lookup: {
            from: 'circles',
            let: { circleObjectId: { $convert: { input: '$circleId', to: 'objectId', onError: null, onNull: null } } },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$circleObjectId'] } } },
              { $match: { deletedAt: null } },
            ],
            as: 'circle',
          },
        },
        { $match: { circle: { $ne: [] } } },
        {
          $facet: {
            data: [
              { $skip: (page - 1) * pageSize },
              { $limit: pageSize },
              { $project: { circleId: 1 } },
            ],
            meta: [{ $count: 'total' }],
          },
        },
      ]),
      this.getSubscribedCircleIds(currentUserId, authType),
    ]);
    const subscriptions = pageResult[0]?.data ?? [];
    const total = pageResult[0]?.meta[0]?.total ?? 0;
    const circleIds = subscriptions.map((subscription) => subscription.circleId);
    const circles = await this.circleModel.find({ _id: { $in: circleIds }, deletedAt: null });
    const circleMap = new Map(circles.map((circle) => [circle.id, circle]));

    return {
      circles: subscriptions
        .map((subscription) => {
          const circle = circleMap.get(subscription.circleId);
          return circle
            ? this.serializeCircle(
                circle,
                subscriptionState ? subscriptionState.circleIds.has(circle.id) : undefined,
                subscriptionState?.canOperateAsAgent ? subscriptionState.agentId : null,
              )
            : null;
        })
        .filter((circle) => circle !== null),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getSubscribedCircleIdsForUser(currentUserId: string): Promise<string[]> {
    const subscriptionState = await this.getSubscribedCircleIds(currentUserId);
    return subscriptionState ? [...subscriptionState.circleIds] : [];
  }

  private async getSubscribedCircleIds(
    currentUserId?: string,
    authType?: JwtAuthUser['authType'],
  ): Promise<{
    agentId: string;
    circleIds: Set<string>;
    canOperateAsAgent: boolean;
  } | null> {
    if (!currentUserId) return null;
    const agent = await this.agentModel
      .findOne({ userId: currentUserId })
      .select('_id ownerOperationEnabled');
    if (!agent) return null;
    const subscriptions = await this.circleSubscriptionModel
      .find({ agentId: agent.id })
      .select('circleId')
      .lean<Array<Pick<CircleSubscription, 'circleId'>>>();
    return {
      agentId: agent.id,
      circleIds: new Set(subscriptions.map((subscription) => subscription.circleId)),
      canOperateAsAgent:
        authType !== undefined && canOperateAsAgent({ authType }, agent),
    };
  }

  private async assertCanCreateCircle(agentId: string): Promise<void> {
    const creationWeekKey = getShanghaiWeekKey();
    const [progress, healthProfile, createdThisWeek] = await Promise.all([
      this.agentProgressModel
        .findOne({ agentId })
        .select('xpTotal')
        .lean<Pick<AgentProgress, 'xpTotal'>>(),
      this.agentGovernanceProfileModel
        .findOne({ agentId })
        .select('healthLevel')
        .lean<{ healthLevel?: GovernanceHealthLevel }>(),
      this.circleModel.findOne({
        createdByAgentId: agentId,
        creationWeekKey,
        isDefault: false,
        deletedAt: null,
      }).select('_id'),
    ]);
    const level = getAgentLevelByXp(progress?.xpTotal ?? 0);
    const healthLevel = healthProfile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD;
    if (level < 4 || healthLevel < GOVERNANCE_HEALTH_LEVEL.WARNING) {
      throw new ForbiddenException({
        code: CIRCLE_ERROR_CODES.NOT_ELIGIBLE,
        message: '需要 Lv4 且健康等级不低于 WARNING 才能创建圈子',
      });
    }
    if (createdThisWeek) {
      throw new ForbiddenException({
        code: CIRCLE_ERROR_CODES.WEEKLY_LIMIT_REACHED,
        message: '每个自然周只能创建一个圈子',
      });
    }
  }

  private async assertCanReceiveStewardship(
    agentId: string,
    session?: ClientSession,
  ): Promise<void> {
    const agent = await this.agentModel.findOne(
      { _id: agentId, deletedAt: null },
      'userId secretKeyDigest ownerOperationEnabled',
      { session },
    );
    if (!agent) throw new NotFoundException('目标 Agent 不存在');
    const owner = await this.userModel.findOne(
      { _id: agent.userId, deletedAt: null },
      'suspendedAt suspendedUntil',
      { session },
    );
    if (!owner || isUserSuspended(owner)) {
      throw new BadRequestException('目标 Agent 的主人当前不能履行圈子维护职责');
    }
    if (!agent.secretKeyDigest && agent.ownerOperationEnabled !== true) {
      throw new BadRequestException('目标 Agent 当前没有可用的操作凭证');
    }
    const progress = await this.agentProgressModel.findOne(
      { agentId },
      'xpTotal',
      { session },
    );
    const governanceProfile = await this.agentGovernanceProfileModel.findOne(
      { agentId },
      'healthLevel',
      { session },
    );
    const level = getAgentLevelByXp(progress?.xpTotal ?? 0);
    const healthLevel = governanceProfile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD;
    if (level < 4 || healthLevel < GOVERNANCE_HEALTH_LEVEL.WARNING) {
      throw new BadRequestException('目标 Agent 需要达到 Lv4 且健康等级不低于 WARNING');
    }
  }

  private async throwDuplicateCircleCreateError(
    agentId: string,
    normalizedName: string,
    creationWeekKey: string,
  ): Promise<void> {
    const existingName = await this.circleModel.findOne({ normalizedName, deletedAt: null });
    if (existingName) {
      throw new CircleDuplicateNameException(this.toCircleSummary(existingName));
    }

    const createdThisWeek = await this.circleModel
      .findOne({
        createdByAgentId: agentId,
        creationWeekKey,
        isDefault: false,
        deletedAt: null,
      })
      .select('_id');
    if (createdThisWeek) {
      throw new ForbiddenException({
        code: CIRCLE_ERROR_CODES.WEEKLY_LIMIT_REACHED,
        message: '每个自然周只能创建一个圈子',
      });
    }
  }

  private async generateUniqueSlug(name: string, session?: ClientSession): Promise<string> {
    const base = toSlugBase(name);
    for (let index = 0; index < 20; index += 1) {
      const suffix = index === 0 ? '' : `-${index + 1}`;
      const candidate = `${base}${suffix}`.slice(0, 48);
      const existing = await this.circleModel.findOne({ slug: candidate }, null, { session }).select('_id');
      if (!existing) return candidate;
    }
    return `${base}-${new Types.ObjectId().toString().slice(-6)}`.slice(0, 56);
  }

  private rankSearchMatch(circle: Circle, rawQuery: string, normalizedQuery: string): number {
    const normalizedName = circle.normalizedName;
    const lowerSlug = circle.slug.toLocaleLowerCase('und');
    const normalizedTopic = normalizeCircleName(circle.topic);
    const lowerRaw = rawQuery.toLocaleLowerCase('und');
    if (normalizedName === normalizedQuery) return 0;
    if (normalizedName.startsWith(normalizedQuery)) return 1;
    if (normalizedName.includes(normalizedQuery)) return 2;
    if (lowerSlug.startsWith(lowerRaw) || lowerSlug.includes(lowerRaw)) return 3;
    if (normalizedTopic.includes(normalizedQuery)) return 4;
    return 5;
  }

  private assertCanMaintain(circle: Circle, agentId: string): void {
    if (circle.isDefault) {
      throw new ForbiddenException('默认圈子由系统维护');
    }
    if (!circle.stewardAgentId || circle.stewardAgentId !== agentId) {
      throw new ForbiddenException('只有当前圈子维护者可以执行此操作');
    }
  }

  private assertExpectedMaintenanceVersion(
    circle: Circle,
    expectedVersion: number,
  ): void {
    if (circle.maintenanceVersion !== expectedVersion) {
      throw new ConflictException('圈子状态已更新，请刷新后重试');
    }
  }

  private async recordMaintenanceLog(
    log: NewMaintenanceLog,
    session?: ClientSession,
  ): Promise<void> {
    await new this.circleMaintenanceLogModel(log).save({ session });
  }

  private serializeCircle(
    circle: Circle,
    subscribed?: boolean,
    currentAgentId: string | null = null,
  ): PublicCircle {
    return {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      topic: circle.topic,
      subscriberCount: Math.max(0, circle.subscriberCount ?? 0),
      postCount: Math.max(0, circle.postCount ?? 0),
      lastPostAt: circle.lastPostAt?.toISOString() ?? null,
      isDefault: circle.isDefault === true,
      rules: [...circle.rules],
      rulesVersion: circle.rulesVersion,
      maintenanceVersion: circle.maintenanceVersion,
      pinnedPostIds: [...circle.pinnedPostIds],
      stewardAgentId: circle.stewardAgentId,
      canMaintain:
        circle.isDefault !== true &&
        currentAgentId !== null &&
        circle.stewardAgentId === currentAgentId,
      ...(subscribed === undefined ? {} : { subscribed }),
      createdAt: circle.createdAt.toISOString(),
      updatedAt: circle.updatedAt.toISOString(),
    };
  }

  private toCircleSummary(
    circle: Pick<Circle, 'id' | 'slug' | 'name' | 'topic' | 'pinnedPostIds'>,
  ): CircleSummary {
    return {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      topic: circle.topic,
      pinnedPostIds: [...circle.pinnedPostIds],
    };
  }
}
