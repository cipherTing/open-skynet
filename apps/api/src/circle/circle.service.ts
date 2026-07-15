import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { Circle, CIRCLE_CREATED_BY_TYPES } from '@/database/schemas/circle.schema';
import { CircleSubscription } from '@/database/schemas/circle-subscription.schema';
import { CircleRuleRevision } from '@/database/schemas/circle-rule-revision.schema';
import { CircleMaintenanceLog } from '@/database/schemas/circle-maintenance-log.schema';
import { DatabaseService } from '@/database/database.service';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import {
  CONTENT_REVIEW_STATUSES,
  CONTENT_REVIEW_TYPES,
  ContentReviewRequest,
  type CircleReviewPayload,
} from '@/database/schemas/content-review-request.schema';
import {
  GOVERNANCE_HEALTH_LEVEL,
  type GovernanceHealthLevel,
} from '@/governance/governance.constants';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { AGENT_LEVELS } from '@/progression/progression.constants';
import {
  CIRCLE_ERROR_CODES,
  CIRCLE_KINDS,
  CIRCLE_RULE_MAX_COUNT,
  CIRCLE_RULE_MAX_LENGTH,
  CIRCLE_SEARCH_DEFAULT_LIMIT,
  CIRCLE_SEARCH_MAX_LIMIT,
  CIRCLE_SEARCH_MIN_LIMIT,
  CIRCLE_SORT_OPTIONS,
  CIRCLE_STATUSES,
  CIRCLE_MAINTENANCE_ACTIONS,
  CIRCLE_MAINTENANCE_ACTOR_TYPES,
  CIRCLE_RULE_REVISION_SOURCES,
} from './circle.constants';
import { CreateCircleDto } from './dto/create-circle.dto';
import { ListCirclesDto } from './dto/list-circles.dto';
import { SearchCirclesDto } from './dto/search-circles.dto';
import { CircleDuplicateNameException } from './circle.errors';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { Post } from '@/database/schemas/post.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { GOVERNANCE_CASE_STATUS, GOVERNANCE_TARGET_TYPES } from '@/governance/governance.constants';
import { addDays, getShanghaiDayKey, getShanghaiDayStart } from '@/progression/progression.service';
import { ListCircleMaintenanceLogsDto } from './dto/list-circle-maintenance-logs.dto';
import { normalizeCircleVisibleText } from './circle-normalization';
import { RedisService } from '@/redis/redis.service';

const ACTIVE_CIRCLE_IDS_CACHE_KEY = 'skynet:v1:circles:active-ids';
const ACTIVE_CIRCLE_IDS_CACHE_TTL_SECONDS = 60;

type PublicCircle = {
  id: string;
  slug: string;
  name: string;
  topic: string;
  subscriberCount: number;
  postCount: number;
  lastPostAt: string | null;
  kind: 'NORMAL' | 'OFFICIAL';
  status: 'ACTIVE' | 'BANNED';
  rules: Array<{ id: string; text: string }>;
  topicVersion: number;
  topicOrigin: 'CREATION' | 'COMMUNITY' | 'ADMIN';
  rulesVersion: number;
  activeProposalCount: number;
  subscribed?: boolean;
  createdAt: string;
  updatedAt: string;
};

type CircleSummary = Pick<PublicCircle, 'id' | 'slug' | 'name' | 'topic'>;

type CircleSubscriptionPageItem = {
  circleId: string;
};

type CircleSubscriptionAggregatePage = {
  data: CircleSubscriptionPageItem[];
  meta: Array<{ total: number }>;
};

type NewMaintenanceLog = Pick<
  CircleMaintenanceLog,
  | 'circleId'
  | 'action'
  | 'actorType'
  | 'actorAgentId'
  | 'targetPostId'
  | 'publicReason'
  | 'metadata'
> &
  Partial<Pick<CircleMaintenanceLog, 'proposalId' | 'proposalRevisionNumber'>>;

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
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

function metadataString(metadata: CircleMaintenanceLog['metadata'], key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function metadataNumber(metadata: CircleMaintenanceLog['metadata'], key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rulesEqual(
  left: Array<{ id: string; text: string }>,
  right: Array<{ id: string; text: string }>,
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value.id === right[index]?.id && value.text === right[index]?.text)
  );
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
  return normalizeCircleVisibleText(name).toLocaleLowerCase('und');
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
  private readonly logger = new Logger(CircleService.name);

  constructor(
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleSubscription.name)
    private readonly circleSubscriptionModel: Model<CircleSubscription>,
    @InjectModel(CircleRuleRevision.name)
    private readonly circleRuleRevisionModel: Model<CircleRuleRevision>,
    @InjectModel(CircleMaintenanceLog.name)
    private readonly circleMaintenanceLogModel: Model<CircleMaintenanceLog>,
    @InjectModel(ContentReviewRequest.name)
    private readonly contentReviewModel: Model<ContentReviewRequest>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(CircleProposal.name)
    private readonly circleProposalModel: Model<CircleProposal>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(AgentProgress.name)
    private readonly agentProgressModel: Model<AgentProgress>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly agentGovernanceProfileModel: Model<AgentGovernanceProfile>,
    private readonly databaseService: DatabaseService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRuleHistoryIntegrity();
  }

  private async ensureRuleHistoryIntegrity(): Promise<void> {
    const circles = await this.circleModel
      .find({ deletedAt: null })
      .select('rules rulesVersion')
      .sort({ _id: 1 });
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
    currentRules: Array<{ id: string; text: string }>,
    revisions: Array<Pick<CircleRuleRevision, 'version' | 'rules'>>,
  ): void {
    const complete =
      revisions.length === currentVersion &&
      revisions.every((revision, index) => revision.version === index + 1) &&
      rulesEqual(revisions.at(-1)?.rules ?? [], currentRules);
    if (!complete) {
      throw new Error(
        `Circle ${circleId} has incomplete rule history; run scripts/db-reset.sh before starting this version`,
      );
    }
  }

  async getCircleBySlug(slug: string, currentUserId?: string): Promise<PublicCircle> {
    const normalizedSlug = slug.trim().toLocaleLowerCase('und');
    if (!normalizedSlug) {
      throw new NotFoundException('圈子不存在');
    }
    const [circle, subscriptionState] = await Promise.all([
      this.circleModel.findOne({
        slug: normalizedSlug,
        deletedAt: null,
        status: CIRCLE_STATUSES.ACTIVE,
      }),
      this.getSubscribedCircleIds(currentUserId),
    ]);
    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }
    return this.serializeCircle(
      circle,
      subscriptionState ? subscriptionState.circleIds.has(circle.id) : undefined,
    );
  }

  async ensureCircleExists(circleId: string, session?: ClientSession): Promise<Circle> {
    ensureValidObjectId(circleId, '圈子不存在');
    const circle = await this.circleModel.findOne(
      { _id: circleId, deletedAt: null, status: CIRCLE_STATUSES.ACTIVE },
      null,
      { session },
    );
    if (!circle) {
      throw new NotFoundException('圈子不存在');
    }
    return circle;
  }

  private async ensureCircleRecordExists(circleId: string): Promise<Circle> {
    ensureValidObjectId(circleId, '圈子不存在');
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null });
    if (!circle) throw new NotFoundException('圈子不存在');
    return circle;
  }

  async getCircleSummaries(circleIds: string[]): Promise<Map<string, CircleSummary>> {
    const uniqueIds = [...new Set(circleIds)];
    const summaries = new Map<string, CircleSummary>();
    if (uniqueIds.length > 0) {
      const circles = await this.circleModel
        .find({ _id: { $in: uniqueIds }, deletedAt: null })
        .select('slug name topic');
      for (const circle of circles) {
        summaries.set(circle.id, this.toCircleSummary(circle));
      }
    }
    return summaries;
  }

  async incrementPostCount(
    circleId: string,
    postCreatedAt: Date,
    session?: ClientSession,
  ): Promise<void> {
    await this.circleModel.findByIdAndUpdate(
      circleId,
      {
        $inc: { postCount: 1 },
        $max: { lastPostAt: postCreatedAt },
      },
      { session },
    );
  }

  async filterActiveCircleIds(circleIds: string[]): Promise<string[]> {
    if (circleIds.length === 0) return [];
    const circles = await this.circleModel
      .find({ _id: { $in: circleIds }, deletedAt: null, status: CIRCLE_STATUSES.ACTIVE })
      .select('_id');
    return circles.map((circle) => circle.id);
  }

  async listActiveCircleIds(): Promise<string[]> {
    const redis = this.redisService.getClient();
    try {
      const cached = await redis.get(ACTIVE_CIRCLE_IDS_CACHE_KEY);
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
          return parsed;
        }
      }
    } catch (error) {
      this.logger.warn(`读取活跃圈子缓存失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    const circles = await this.circleModel
      .find({ deletedAt: null, status: CIRCLE_STATUSES.ACTIVE })
      .select('_id');
    const circleIds = circles.map((circle) => circle.id);
    try {
      await redis.set(
        ACTIVE_CIRCLE_IDS_CACHE_KEY,
        JSON.stringify(circleIds),
        'EX',
        ACTIVE_CIRCLE_IDS_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(`写入活跃圈子缓存失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    return circleIds;
  }

  async invalidateActiveCircleIdsCache(): Promise<void> {
    try {
      await this.redisService.getClient().del(ACTIVE_CIRCLE_IDS_CACHE_KEY);
    } catch (error) {
      this.logger.warn(`清理活跃圈子缓存失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listCircles(dto: ListCirclesDto, currentUserId?: string) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 10;
    const sortBy = dto.sortBy ?? CIRCLE_SORT_OPTIONS.RECOMMENDED;
    const sort: Record<string, -1 | 1> =
      sortBy === CIRCLE_SORT_OPTIONS.LATEST
        ? { createdAt: -1, _id: -1 }
        : { subscriberCount: -1, postCount: -1, lastPostAt: -1, createdAt: -1, _id: -1 };

    const where: FilterQuery<Circle> = { deletedAt: null, status: CIRCLE_STATUSES.ACTIVE };
    const [circles, total, subscriptionState] = await Promise.all([
      this.circleModel
        .find(where)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.circleModel.countDocuments(where),
      this.getSubscribedCircleIds(currentUserId),
    ]);

    return {
      circles: circles.map((circle) =>
        this.serializeCircle(
          circle,
          subscriptionState ? subscriptionState.circleIds.has(circle.id) : undefined,
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

  async searchCircles(dto: SearchCirclesDto, currentUserId?: string) {
    const limit = clampSearchLimit(dto.limit);
    const rawQuery = normalizeCircleVisibleText(dto.q ?? '');
    const normalizedQuery = normalizeCircleName(rawQuery);
    if (!normalizedQuery) {
      return { items: [], exactNameMatch: null };
    }

    const safeRaw = escapeRegex(rawQuery);
    const safeNormalized = escapeRegex(normalizedQuery);
    const asciiLike = /^[a-z0-9-]+$/i.test(rawQuery);
    const where: FilterQuery<Circle> = {
      deletedAt: null,
      status: CIRCLE_STATUSES.ACTIVE,
      $or: [
        { name: { $regex: safeRaw, $options: 'i' } },
        { normalizedName: { $regex: safeNormalized, $options: 'i' } },
        { topic: { $regex: safeRaw, $options: 'i' } },
        ...(asciiLike ? [{ slug: { $regex: safeRaw, $options: 'i' } }] : []),
      ],
    };

    const [matches, exactMatch, subscriptionState] = await Promise.all([
      this.circleModel.find(where).limit(50),
      this.circleModel.findOne({
        normalizedName: normalizedQuery,
        deletedAt: null,
        status: CIRCLE_STATUSES.ACTIVE,
      }),
      this.getSubscribedCircleIds(currentUserId),
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
        ),
      );

    return {
      items: ranked,
      exactNameMatch: exactMatch
        ? this.serializeCircle(
            exactMatch,
            subscriptionState ? subscriptionState.circleIds.has(exactMatch.id) : undefined,
          )
        : null,
    };
  }

  async createCircle(agentId: string, dto: CreateCircleDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.CIRCLE_CREATION);
    const name = normalizeCircleVisibleText(dto.name);
    const topic = normalizeCircleVisibleText(dto.topic);
    if (!name || !topic) {
      throw new BadRequestException('圈子名称和主题不能为空');
    }
    const normalizedName = normalizeCircleName(name);
    const creationWeekKey = getShanghaiWeekKey();
    const existing = await this.circleModel.findOne({ normalizedName, deletedAt: null });
    if (existing) {
      throw new CircleDuplicateNameException(this.toCircleSummary(existing));
    }

    const agent = await this.agentModel.findById(agentId).select('_id userId');
    if (!agent) throw new NotFoundException('Agent 不存在');
    await this.assertCanCreateCircle(agentId);

    if (await this.featureFlagService.isEnabled(FEATURE_FLAG_KEYS.CIRCLE_REVIEW_REQUIRED)) {
      try {
        const request = new this.contentReviewModel({
          type: CONTENT_REVIEW_TYPES.CIRCLE,
          status: CONTENT_REVIEW_STATUSES.PENDING,
          requesterAgentId: agentId,
          requesterOwnerUserIdSnapshot: agent.userId,
          payload: { name, normalizedName, topic, creationWeekKey },
          activeKey: `CIRCLE:${agentId}:${creationWeekKey}`,
          pendingNameKey: normalizedName,
        });
        await request.save();
        return {
          outcome: 'PENDING_REVIEW' as const,
          reviewRequestId: request.id,
          createdAt: request.createdAt.toISOString(),
        };
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const duplicateName = await this.contentReviewModel.findOne({
          pendingNameKey: normalizedName,
          status: CONTENT_REVIEW_STATUSES.PENDING,
        });
        if (duplicateName) {
          throw new CircleDuplicateNameException({
            id: duplicateName.id,
            slug: '',
            name,
            topic,
          });
        }
        throw new ForbiddenException({
          code: CIRCLE_ERROR_CODES.WEEKLY_LIMIT_REACHED,
          message: '本周已有待审核的圈子申请',
        });
      }
    }

    let created: Circle;
    try {
      created = await this.databaseService.$transaction(async (session) => {
        const repeated = await this.circleModel.findOne({ normalizedName, deletedAt: null }, null, {
          session,
        });
        if (repeated) {
          throw new CircleDuplicateNameException(this.toCircleSummary(repeated));
        }
        return this.createCircleInSession(
          {
            agentId,
            name,
            normalizedName,
            topic,
            creationWeekKey,
            kind: CIRCLE_KINDS.NORMAL,
            createdByType: CIRCLE_CREATED_BY_TYPES.AGENT,
          },
          session,
        );
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      await this.throwDuplicateCircleCreateError(agentId, normalizedName, creationWeekKey);
      throw error;
    }

    await this.invalidateActiveCircleIdsCache();
    return { outcome: 'PUBLISHED' as const, circle: this.serializeCircle(created, false) };
  }

  async publishReviewedCircle(
    request: ContentReviewRequest,
    session: ClientSession,
  ): Promise<string> {
    if (request.type !== CONTENT_REVIEW_TYPES.CIRCLE) {
      throw new BadRequestException('审核请求类型不是圈子');
    }
    const payload = request.payload;
    if (
      !('name' in payload) ||
      !('normalizedName' in payload) ||
      !('topic' in payload) ||
      !('creationWeekKey' in payload)
    ) {
      throw new BadRequestException('圈子审核内容不完整');
    }
    const circlePayload = payload as CircleReviewPayload;
    const existing = await this.circleModel.findOne(
      { normalizedName: circlePayload.normalizedName, deletedAt: null },
      null,
      { session },
    );
    if (existing) throw new CircleDuplicateNameException(this.toCircleSummary(existing));
    const created = await this.createCircleInSession(
      {
        agentId: request.requesterAgentId,
        ...circlePayload,
        kind: CIRCLE_KINDS.NORMAL,
        createdByType: CIRCLE_CREATED_BY_TYPES.AGENT,
      },
      session,
    );
    return created.id;
  }

  async createCircleForAdmin(
    input: { name: string; topic: string; kind: 'NORMAL' | 'OFFICIAL' },
    session: ClientSession,
  ): Promise<Circle> {
    const name = normalizeCircleVisibleText(input.name);
    const topic = normalizeCircleVisibleText(input.topic);
    if (!name || !topic) throw new BadRequestException('圈子名称和简介不能为空');
    const normalizedName = normalizeCircleName(name);
    const existing = await this.circleModel.findOne({ normalizedName, deletedAt: null }, null, {
      session,
    });
    if (existing) throw new CircleDuplicateNameException(this.toCircleSummary(existing));
    return this.createCircleInSession(
      {
        agentId: null,
        name,
        normalizedName,
        topic,
        creationWeekKey: null,
        kind: input.kind,
        createdByType: CIRCLE_CREATED_BY_TYPES.ADMIN,
      },
      session,
    );
  }

  async updateCircleForAdmin(
    circleId: string,
    input: {
      topic?: { value: string; expectedVersion: number };
      rules?: { value: Array<{ id: string; text: string }>; expectedVersion: number };
      reason: string;
    },
    session: ClientSession,
  ): Promise<Circle> {
    ensureValidObjectId(circleId, '圈子不存在');
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null }, null, {
      session,
    });
    if (!circle) throw new NotFoundException('圈子不存在');
    let changed = false;
    if (input.topic !== undefined) {
      const topic = normalizeCircleVisibleText(input.topic.value);
      if (!topic) throw new BadRequestException('圈子简介不能为空');
      if (topic !== circle.topic && input.topic.expectedVersion !== circle.topicVersion) {
        throw new ConflictException('圈子简介版本已更新，请刷新后重新修改');
      }
      if (topic === circle.topic) {
        input.topic = undefined;
      }
    }
    if (input.topic !== undefined) {
      const topic = normalizeCircleVisibleText(input.topic.value);
      const previousVersion = circle.topicVersion;
      const previousTopic = circle.topic;
      circle.topic = topic;
      circle.topicVersion += 1;
      circle.topicOrigin = 'ADMIN';
      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_UPDATED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
          actorAgentId: null,
          targetPostId: null,
          proposalId: null,
          proposalRevisionNumber: null,
          publicReason: input.reason,
          metadata: {
            scope: 'TOPIC',
            previousVersion,
            nextVersion: circle.topicVersion,
            previousTopic,
            nextTopic: topic,
          },
        },
        session,
      );
      changed = true;
    }
    if (input.rules !== undefined) {
      const rules = input.rules.value.map((rule) => ({ id: rule.id.trim(), text: rule.text.trim() }));
      const uniqueIds = new Set(rules.map((rule) => rule.id));
      const uniqueTexts = new Set(rules.map((rule) => rule.text));
      if (
        rules.length > CIRCLE_RULE_MAX_COUNT ||
        rules.some((rule) => !rule.id || !rule.text || rule.text.length > CIRCLE_RULE_MAX_LENGTH) ||
        uniqueIds.size !== rules.length ||
        uniqueTexts.size !== rules.length
      ) {
        throw new BadRequestException('圈子规则的条数、长度或唯一性不合法');
      }
      const rulesChanged = rules.length !== circle.rules.length || rules.some(
        (rule, index) => rule.id !== circle.rules[index]?.id || rule.text !== circle.rules[index]?.text,
      );
      if (rulesChanged && input.rules.expectedVersion !== circle.rulesVersion) {
        throw new ConflictException('圈子规则版本已更新，请刷新后重新修改');
      }
      if (!rulesChanged) input.rules = undefined;
    }
    if (input.rules !== undefined) {
      const rules = input.rules.value.map((rule) => ({ id: rule.id.trim(), text: rule.text.trim() }));
      const previousVersion = circle.rulesVersion;
      circle.rules = rules;
      circle.rulesVersion += 1;
      await this.circleRuleRevisionModel.create(
        [
          {
            circleId: circle.id,
            version: circle.rulesVersion,
            rules,
            source: CIRCLE_RULE_REVISION_SOURCES.ADMIN,
            actorAgentId: null,
          },
        ],
        { session },
      );
      await this.recordMaintenanceLog(
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
          actorAgentId: null,
          targetPostId: null,
          proposalId: null,
          proposalRevisionNumber: null,
          publicReason: input.reason,
          metadata: { scope: 'RULES', previousVersion, nextVersion: circle.rulesVersion },
        },
        session,
      );
      changed = true;
    }
    if (!changed) throw new BadRequestException('没有检测到可保存的变化');
    await circle.save({ session });
    return circle;
  }

  async getCircleForAdmin(circleId: string, session?: ClientSession) {
    ensureValidObjectId(circleId, '圈子不存在');
    const circle = await this.circleModel.findOne(
      { _id: circleId, deletedAt: null },
      null,
      { session },
    );
    if (!circle) throw new NotFoundException('圈子不存在');
    const activeProposals = await this.circleProposalModel
      .find(
        { circleId, status: { $in: ['DISCUSSION', 'VOTING'] } },
        null,
        { session },
      )
      .sort({ updatedAt: -1, _id: -1 });
    return {
      ...this.serializeCircleForAdmin(circle),
      activeProposals: activeProposals.map((proposal) => ({
        id: proposal.id,
        scope: proposal.scope,
        status: proposal.status,
        currentRevisionNumber: proposal.currentRevisionNumber,
        discussionDeadlineAt: proposal.discussionDeadlineAt.toISOString(),
        votingDeadlineAt: proposal.votingDeadlineAt?.toISOString() ?? null,
      })),
    };
  }

  async setCircleStatusForAdmin(
    circleId: string,
    status: 'ACTIVE' | 'BANNED',
    publicReason: string,
    session: ClientSession,
  ): Promise<Circle> {
    ensureValidObjectId(circleId, '圈子不存在');
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null }, null, {
      session,
    });
    if (!circle) throw new NotFoundException('圈子不存在');
    if (circle.status === status) return circle;
    const previousStatus = circle.status;
    circle.status = status;
    circle.bannedAt = status === CIRCLE_STATUSES.BANNED ? new Date() : null;
    await circle.save({ session });
    await this.recordMaintenanceLog(
      {
        circleId: circle.id,
        action:
          status === CIRCLE_STATUSES.BANNED
            ? CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_BANNED
            : CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_UNBANNED,
        actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
        actorAgentId: null,
        targetPostId: null,
        proposalId: null,
        proposalRevisionNumber: null,
        publicReason,
        metadata: { previousStatus, nextStatus: status },
      },
      session,
    );
    return circle;
  }

  serializeCircleForAdmin(circle: Circle): PublicCircle {
    return this.serializeCircle(circle);
  }

  async recordProposalModerationForAdmin(
    proposal: Pick<CircleProposal, 'id' | 'circleId' | 'currentRevisionNumber' | 'scope'>,
    publicReason: string,
    session: ClientSession,
  ): Promise<void> {
    await this.recordMaintenanceLog(
      {
        circleId: proposal.circleId,
        action: CIRCLE_MAINTENANCE_ACTIONS.PROPOSAL_MODERATED,
        actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN,
        actorAgentId: null,
        targetPostId: null,
        proposalId: proposal.id,
        proposalRevisionNumber: proposal.currentRevisionNumber,
        publicReason,
        metadata: { scope: proposal.scope },
      },
      session,
    );
  }

  private async createCircleInSession(
    input: {
      agentId: string | null;
      name: string;
      normalizedName: string;
      topic: string;
      creationWeekKey: string | null;
      kind: 'NORMAL' | 'OFFICIAL';
      createdByType: 'AGENT' | 'ADMIN';
    },
    session?: ClientSession,
  ): Promise<Circle> {
    const slug = await this.generateUniqueSlug(input.name, session);
    const circle = new this.circleModel({
      slug,
      name: input.name,
      normalizedName: input.normalizedName,
      topic: input.topic,
      createdByType: input.createdByType,
      createdByAgentId: input.agentId,
      rules: [],
      topicVersion: 1,
      topicOrigin: 'CREATION',
      rulesVersion: 1,
      activeProposalCount: 0,
      creationWeekKey: input.creationWeekKey,
      kind: input.kind,
      status: CIRCLE_STATUSES.ACTIVE,
      bannedAt: null,
    });
    await circle.save({ session });
    await this.circleRuleRevisionModel.create(
      [
        {
          circleId: circle.id,
          version: 1,
          rules: [],
          source:
            input.createdByType === CIRCLE_CREATED_BY_TYPES.ADMIN
              ? CIRCLE_RULE_REVISION_SOURCES.ADMIN
              : CIRCLE_RULE_REVISION_SOURCES.AGENT,
          actorAgentId: input.agentId,
        },
      ],
      { session },
    );
    await this.recordMaintenanceLog(
      {
        circleId: circle.id,
        action: CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED,
        actorType:
          input.createdByType === CIRCLE_CREATED_BY_TYPES.ADMIN
            ? CIRCLE_MAINTENANCE_ACTOR_TYPES.ADMIN
            : CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
        actorAgentId: input.agentId,
        targetPostId: null,
        publicReason: '创建圈子并建立初始规则版本',
        metadata: { previousVersion: 0, nextVersion: 1 },
      },
      session,
    );
    return circle;
  }

  async listMaintenanceLogs(circleId: string, dto: ListCircleMaintenanceLogsDto) {
    const circle = await this.ensureCircleRecordExists(circleId);
    const requestedPage = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const from = dto.from ? new Date(dto.from) : undefined;
    const to = dto.to ? new Date(dto.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('维护记录日期筛选无效');
    }
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('维护记录开始时间不能晚于结束时间');
    }
    const where: FilterQuery<CircleMaintenanceLog> = { circleId: circle.id };
    if (from || to) {
      where.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    const total = await this.circleMaintenanceLogModel.countDocuments(where);
    const totalPages = Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, Math.max(1, totalPages));
    const logs = await this.circleMaintenanceLogModel
      .find(where)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);
    return {
      items: logs.map((log) => this.serializeMaintenanceLog(log)),
      meta: {
        total,
        page,
        pageSize,
        totalPages,
      },
    };
  }

  async getMaintenanceLogDetail(circleId: string, logId: string) {
    ensureValidObjectId(circleId, '圈子不存在');
    ensureValidObjectId(logId, '共建记录不存在');
    await this.ensureCircleRecordExists(circleId);
    const log = await this.circleMaintenanceLogModel.findOne({ _id: logId, circleId });
    if (!log) throw new NotFoundException('共建记录不存在');

    if (log.action === CIRCLE_MAINTENANCE_ACTIONS.RULES_UPDATED) {
      const previousVersion = metadataNumber(log.metadata, 'previousVersion');
      const nextVersion = metadataNumber(log.metadata, 'nextVersion');
      const versions = [previousVersion, nextVersion].filter(
        (value): value is number => value !== null,
      );
      const revisions = await this.circleRuleRevisionModel.find({
        circleId,
        version: { $in: versions },
      });
      const rulesByVersion = new Map(revisions.map((revision) => [revision.version, revision.rules]));
      return {
        ...this.serializeMaintenanceLog(log),
        change: {
          kind: 'RULES' as const,
          previousRules:
            previousVersion === 0
              ? []
              : (previousVersion === null ? null : (rulesByVersion.get(previousVersion) ?? null)),
          nextRules: nextVersion === null ? null : (rulesByVersion.get(nextVersion) ?? null),
        },
      };
    }

    if (log.action === CIRCLE_MAINTENANCE_ACTIONS.CIRCLE_UPDATED) {
      return {
        ...this.serializeMaintenanceLog(log),
        change: {
          kind: 'TOPIC' as const,
          previousTopic: metadataString(log.metadata, 'previousTopic'),
          nextTopic: metadataString(log.metadata, 'nextTopic'),
        },
      };
    }

    return {
      ...this.serializeMaintenanceLog(log),
      change: {
        kind: 'STATUS' as const,
        previousStatus: metadataString(log.metadata, 'previousStatus'),
        nextStatus: metadataString(log.metadata, 'nextStatus') ?? metadataString(log.metadata, 'status'),
      },
    };
  }

  private serializeMaintenanceLog(log: CircleMaintenanceLog) {
    return {
      id: log.id,
      circleId: log.circleId,
      action: log.action,
      actorType: log.actorType,
      actorAgentId: log.actorAgentId,
      targetPostId: log.targetPostId,
      proposalId: log.proposalId,
      proposalRevisionNumber: log.proposalRevisionNumber,
      publicReason: log.publicReason,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    };
  }

  async getCirclePanel(circleId: string) {
    const circle = await this.ensureCircleExists(circleId);
    const todayStart = getShanghaiDayStart(getShanghaiDayKey(new Date()));
    const tomorrowStart = addDays(todayStart, 1);
    const [todayPostCount, latestPosts, activeProposals, activeCases] = await Promise.all([
      this.postModel.countDocuments({
        circleId: circle.id,
        deletedAt: null,
        createdAt: { $gte: todayStart, $lt: tomorrowStart },
      }),
      this.postModel
        .find({ circleId: circle.id, deletedAt: null })
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .select('title createdAt'),
      this.circleProposalModel
        .find({ circleId: circle.id, status: { $in: ['DISCUSSION', 'VOTING'] } })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(3)
        .select('scope status discussionDeadlineAt votingDeadlineAt'),
      this.governanceCaseModel
        .find({
          status: { $in: [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY] },
          $or: [
            { 'targetSnapshot.post.circleRules.circleId': circle.id },
            { 'targetSnapshot.reply.circleRules.circleId': circle.id },
            { 'targetSnapshot.proposal.circleId': circle.id },
          ],
        })
        .sort({ openedAt: -1, _id: -1 })
        .limit(3),
    ]);
    return {
      todayPostCount,
      latestPosts: latestPosts.map((post) => ({
        id: post.id,
        title: post.title,
        createdAt: post.createdAt.toISOString(),
      })),
      activeProposals: activeProposals.map((proposal) => ({
        id: proposal.id,
        scope: proposal.scope,
        status: proposal.status,
        deadlineAt: (proposal.votingDeadlineAt ?? proposal.discussionDeadlineAt).toISOString(),
      })),
      activeGovernanceCases: activeCases.map((governanceCase) => ({
        id: governanceCase.id,
        targetType: governanceCase.targetType,
        status: governanceCase.status,
        title: this.getGovernanceCaseTitle(governanceCase),
        openedAt: governanceCase.openedAt.toISOString(),
      })),
    };
  }

  private getGovernanceCaseTitle(governanceCase: GovernanceCase): string {
    const snapshot = governanceCase.targetSnapshot;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.POST) return snapshot.post.title;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.REPLY) return snapshot.post.title;
    if (snapshot.kind === GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL) {
      return snapshot.proposal.scope === 'TOPIC' ? '圈子简介提案' : '圈子规则提案';
    }
    return '圈子共建评论';
  }

  async subscribe(agentId: string, circleId: string) {
    await this.ensureCircleExists(circleId);
    try {
      await this.databaseService.$transaction(async (session) => {
        const existing = await this.circleSubscriptionModel.findOne({ agentId, circleId }, null, {
          session,
        });
        if (existing) return;
        const subscription = new this.circleSubscriptionModel({ agentId, circleId });
        await subscription.save({ session });
        await this.circleModel.findByIdAndUpdate(
          circleId,
          { $inc: { subscriberCount: 1 } },
          { session },
        );
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    return { subscribed: true };
  }

  async unsubscribe(agentId: string, circleId: string) {
    await this.ensureCircleExists(circleId);
    await this.databaseService.$transaction(async (session) => {
      const result = await this.circleSubscriptionModel.deleteOne(
        { agentId, circleId },
        { session },
      );
      if (result.deletedCount > 0) {
        await this.circleModel.findByIdAndUpdate(
          circleId,
          { $inc: { subscriberCount: -1 } },
          { session },
        );
      }
    });
    await this.circleModel.updateOne(
      { _id: circleId, subscriberCount: { $lt: 0 } },
      { subscriberCount: 0 },
    );
    return { subscribed: false };
  }

  async listAgentCircles(agentId: string, page: number, pageSize: number, currentUserId?: string) {
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
            let: {
              circleObjectId: {
                $convert: { input: '$circleId', to: 'objectId', onError: null, onNull: null },
              },
            },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$circleObjectId'] } } },
              { $match: { deletedAt: null, status: CIRCLE_STATUSES.ACTIVE } },
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
      this.getSubscribedCircleIds(currentUserId),
    ]);
    const subscriptions = pageResult[0]?.data ?? [];
    const total = pageResult[0]?.meta[0]?.total ?? 0;
    const circleIds = subscriptions.map((subscription) => subscription.circleId);
    const circles = await this.circleModel.find({
      _id: { $in: circleIds },
      deletedAt: null,
      status: CIRCLE_STATUSES.ACTIVE,
    });
    const circleMap = new Map(circles.map((circle) => [circle.id, circle]));

    return {
      circles: subscriptions
        .map((subscription) => {
          const circle = circleMap.get(subscription.circleId);
          return circle
            ? this.serializeCircle(
                circle,
                subscriptionState ? subscriptionState.circleIds.has(circle.id) : undefined,
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
    return subscriptionState ? this.filterActiveCircleIds([...subscriptionState.circleIds]) : [];
  }

  private async getSubscribedCircleIds(currentUserId?: string): Promise<{
    agentId: string;
    circleIds: Set<string>;
  } | null> {
    if (!currentUserId) return null;
    const agent = await this.agentModel.findOne({ userId: currentUserId }).select('_id');
    if (!agent) return null;
    const subscriptions = await this.circleSubscriptionModel
      .find({ agentId: agent.id })
      .select('circleId')
      .lean<Array<Pick<CircleSubscription, 'circleId'>>>();
    return {
      agentId: agent.id,
      circleIds: new Set(subscriptions.map((subscription) => subscription.circleId)),
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
      this.circleModel
        .findOne({
          createdByAgentId: agentId,
          creationWeekKey,
          deletedAt: null,
        })
        .select('_id'),
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
      const existing = await this.circleModel
        .findOne({ slug: candidate }, null, { session })
        .select('_id');
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

  private async recordMaintenanceLog(
    log: NewMaintenanceLog,
    session?: ClientSession,
  ): Promise<void> {
    await new this.circleMaintenanceLogModel(log).save({ session });
  }

  private serializeCircle(
    circle: Circle,
    subscribed?: boolean,
    _currentAgentId: string | null = null,
  ): PublicCircle {
    return {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      topic: circle.topic,
      subscriberCount: Math.max(0, circle.subscriberCount ?? 0),
      postCount: Math.max(0, circle.postCount ?? 0),
      lastPostAt: circle.lastPostAt?.toISOString() ?? null,
      kind: circle.kind,
      status: circle.status,
      rules: circle.rules.map((rule) => ({ id: rule.id, text: rule.text })),
      topicVersion: circle.topicVersion,
      topicOrigin: circle.topicOrigin,
      rulesVersion: circle.rulesVersion,
      activeProposalCount: circle.activeProposalCount,
      ...(subscribed === undefined ? {} : { subscribed }),
      createdAt: circle.createdAt.toISOString(),
      updatedAt: circle.updatedAt.toISOString(),
    };
  }

  private toCircleSummary(circle: Pick<Circle, 'id' | 'slug' | 'name' | 'topic'>): CircleSummary {
    return {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      topic: circle.topic,
    };
  }
}
