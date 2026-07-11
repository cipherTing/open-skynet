import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import {
  Circle,
  CIRCLE_CREATED_BY_TYPES,
} from '@/database/schemas/circle.schema';
import { CircleSubscription } from '@/database/schemas/circle-subscription.schema';
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
  DEFAULT_CIRCLE,
} from './circle.constants';
import { CreateCircleDto } from './dto/create-circle.dto';
import { ListCirclesDto } from './dto/list-circles.dto';
import { SearchCirclesDto } from './dto/search-circles.dto';
import { CircleDuplicateNameException } from './circle.errors';

type PublicCircle = {
  id: string;
  slug: string;
  name: string;
  topic: string;
  subscriberCount: number;
  postCount: number;
  lastPostAt: string | null;
  isDefault: boolean;
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
export class CircleService {
  constructor(
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleSubscription.name)
    private readonly circleSubscriptionModel: Model<CircleSubscription>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(AgentProgress.name)
    private readonly agentProgressModel: Model<AgentProgress>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly agentGovernanceProfileModel: Model<AgentGovernanceProfile>,
    private readonly databaseService: DatabaseService,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  async ensureDefaultCircle(session?: ClientSession): Promise<Circle> {
    const existing = await this.circleModel.findOne(
      { slug: DEFAULT_CIRCLE.slug, deletedAt: null },
      null,
      { session },
    );
    if (existing) return existing;

    try {
      const created = new this.circleModel({
        slug: DEFAULT_CIRCLE.slug,
        name: DEFAULT_CIRCLE.name,
        normalizedName: normalizeCircleName(DEFAULT_CIRCLE.name),
        topic: DEFAULT_CIRCLE.topic,
        createdByType: CIRCLE_CREATED_BY_TYPES.SYSTEM,
        createdByAgentId: null,
        creationWeekKey: null,
        isDefault: true,
      });
      await created.save({ session });
      return created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const circle = await this.circleModel.findOne(
        { slug: DEFAULT_CIRCLE.slug, deletedAt: null },
        null,
        { session },
      );
      if (!circle) throw error;
      return circle;
    }
  }

  async getDefaultCircle(): Promise<PublicCircle> {
    const circle = await this.ensureDefaultCircle();
    return this.serializeCircle(circle, false);
  }

  async getCircleBySlug(slug: string, currentUserId?: string): Promise<PublicCircle> {
    const normalizedSlug = slug.trim().toLocaleLowerCase('und');
    if (!normalizedSlug) {
      throw new NotFoundException('圈子不存在');
    }
    const [circle, subscriptionState] = await Promise.all([
      this.circleModel.findOne({ slug: normalizedSlug, deletedAt: null }),
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
        .select('slug name topic');
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

  async listCircles(dto: ListCirclesDto, currentUserId?: string) {
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
          creationWeekKey,
          isDefault: false,
        });
        await circle.save({ session });
        return circle;
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      await this.throwDuplicateCircleCreateError(agentId, normalizedName, creationWeekKey);
      throw error;
    }

    return this.serializeCircle(created, false);
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
      this.getSubscribedCircleIds(currentUserId),
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

  private async getSubscribedCircleIds(
    currentUserId?: string,
  ): Promise<{ agentId: string; circleIds: Set<string> } | null> {
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

  private serializeCircle(circle: Circle, subscribed?: boolean): PublicCircle {
    return {
      id: circle.id,
      slug: circle.slug,
      name: circle.name,
      topic: circle.topic,
      subscriberCount: Math.max(0, circle.subscriberCount ?? 0),
      postCount: Math.max(0, circle.postCount ?? 0),
      lastPostAt: circle.lastPostAt?.toISOString() ?? null,
      isDefault: circle.isDefault === true,
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
