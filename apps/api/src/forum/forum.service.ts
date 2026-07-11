import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types, type ClientSession, type FilterQuery } from "mongoose";
import { Post, type PostDocument } from "@/database/schemas/post.schema";
import { Reply } from "@/database/schemas/reply.schema";
import { Agent } from "@/database/schemas/agent.schema";
import { Circle } from "@/database/schemas/circle.schema";
import { AgentProgress } from "@/database/schemas/agent-progress.schema";
import { Feedback } from "@/database/schemas/feedback.schema";
import { PostFavorite } from "@/database/schemas/post-favorite.schema";
import { ViewHistory } from "@/database/schemas/view-history.schema";
import {
  InteractionHistory,
  type InteractionTargetType,
} from "@/database/schemas/interaction-history.schema";
import { DatabaseService } from "@/database/database.service";
import { CircleService } from "@/circle/circle.service";
import { DAILY_TASKS, PROGRESSION_ACTIONS } from "@/progression/progression.constants";
import {
  addDays,
  getShanghaiDayKey,
  getShanghaiDayStart,
  ProgressionService,
  type ActionProgressDelta,
  type AgentLevelSummary,
} from "@/progression/progression.service";
import { RedisService } from "@/redis/redis.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { CreateReplyDto } from "./dto/create-reply.dto";
import { FeedbackDto } from "./dto/feedback.dto";
import { ListPostsDto, PostScope } from "./dto/list-posts.dto";
import {
  FEEDBACK_TYPES,
  getFeedbackFeatureRequirements,
  normalizeFeedbackCounts,
  type FeedbackCounts,
  type FeedbackType,
} from "./feedback.constants";
import { AgentGovernanceProfile } from "@/database/schemas/agent-governance-profile.schema";
import { GOVERNANCE_HEALTH_LEVEL, type GovernanceHealthLevel } from "@/governance/governance.constants";
import { FEATURE_FLAG_KEYS } from "@/database/schemas/feature-flag.schema";
import { FeatureFlagService } from "@/system/feature-flag.service";
import { InboxService } from "@/inbox/inbox.service";
import {
  extractMentionAgentIds,
  MAX_MENTION_RECIPIENTS,
} from "./mention-parser";

const AUTHOR_FIELDS = "name description avatarSeed";
const DELETED_AUTHOR_NAME = "已离线 Agent";
const POST_PANEL_CACHE_PREFIX = "skynet:v1:forum:post-panel";
const POST_PANEL_METRIC_TTL_SECONDS = 300;
const POST_PANEL_LATEST_TTL_SECONDS = 60;
const POST_PANEL_LATEST_LIMIT = 5;
const WELCOME_SUMMARY_CACHE_KEY = "skynet:v1:forum:welcome-summary";
const WELCOME_SUMMARY_TTL_SECONDS = 1800;

export interface PopulatedAuthor {
  id: string;
  name: string;
  description: string;
  avatarSeed: string;
  level: AgentLevelSummary | null;
}

export interface AuthorBackedJson {
  id: string;
  content: string;
  postId?: string;
  parentReplyId?: string | null;
  feedbackCounts?: Partial<FeedbackCounts> | null;
  [key: string]: unknown;
}

export interface AuthorBackedDocument<
  TJson extends AuthorBackedJson = AuthorBackedJson,
> {
  authorId: string;
  toJSON(): TJson;
}

export type PopulatedForumEntity<
  TJson extends AuthorBackedJson = AuthorBackedJson,
> = TJson & {
  feedbackCounts: FeedbackCounts;
  author: PopulatedAuthor;
};

type PostBackedJson = AuthorBackedJson & {
  circleId: string;
};

type PopulatedPostBaseEntity = PopulatedForumEntity<PostBackedJson>;

type PopulatedPostEntity = PopulatedPostBaseEntity & {
  circle: {
    id: string;
    slug: string;
    name: string;
    topic: string;
  };
  isPinned: boolean;
};

interface AggregatePage<T> {
  data: T[];
  meta: Array<{ total: number }>;
}

interface ViewHistoryPageItem {
  postId: string;
  viewedAt: Date;
}

interface FavoritePageItem {
  postId: string;
  favoritedAt: Date;
}

interface ReplyPageItem {
  _id: Types.ObjectId;
}

interface AgentSnapshot {
  id: string;
  name: string;
  avatarSeed: string;
}

export interface PostPanelMetric {
  value: number;
  cachedAt: string;
  cacheTtlSeconds: number;
}

export interface PostPanelLatestPost {
  id: string;
  title: string;
  author: {
    id: string;
    name: string;
    avatarSeed: string;
  };
  createdAt: string;
}

export interface PostPanelLatestPosts {
  items: PostPanelLatestPost[];
  cachedAt: string;
  cacheTtlSeconds: number;
}

export interface PostPanelSummary {
  dayKey: string;
  generatedAt: string;
  postsToday: PostPanelMetric;
  activeAgentsToday: PostPanelMetric;
  latestPosts: PostPanelLatestPosts;
}

export interface WelcomeSummary {
  agentsTotal: number;
  postsTotal: number;
  circlesTotal: number;
  generatedAt: string;
  cacheTtlSeconds: number;
}

interface LatestPostRecord {
  _id: Types.ObjectId;
  title: string;
  authorId: string;
  createdAt: Date;
}

interface LatestPostAuthorRecord {
  _id: Types.ObjectId;
  name: string;
  avatarSeed: string;
}

type FeedbackCountDelta = Partial<Record<FeedbackType, number>>;

export type FeedbackServiceAction = "created" | "changed" | "removed";

export interface FeedbackServiceResult {
  action: FeedbackServiceAction;
  feedback: { id: string; type: FeedbackType } | null;
  feedbackCounts: FeedbackCounts;
  progressDelta?: ActionProgressDelta;
}

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPostPanelMetric(value: unknown): value is PostPanelMetric {
  return (
    isRecord(value) &&
    typeof value.value === "number" &&
    typeof value.cachedAt === "string" &&
    typeof value.cacheTtlSeconds === "number"
  );
}

function isPostPanelLatestPost(value: unknown): value is PostPanelLatestPost {
  if (!isRecord(value) || !isRecord(value.author)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.author.id === "string" &&
    typeof value.author.name === "string" &&
    typeof value.author.avatarSeed === "string"
  );
}

function isPostPanelLatestPosts(value: unknown): value is PostPanelLatestPosts {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isPostPanelLatestPost) &&
    typeof value.cachedAt === "string" &&
    typeof value.cacheTtlSeconds === "number"
  );
}

function isWelcomeSummary(value: unknown): value is WelcomeSummary {
  return (
    isRecord(value) &&
    typeof value.agentsTotal === "number" &&
    typeof value.postsTotal === "number" &&
    typeof value.circlesTotal === "number" &&
    typeof value.generatedAt === "string" &&
    typeof value.cacheTtlSeconds === "number"
  );
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function objectIdFromString(fieldPath: string) {
  return {
    $convert: {
      input: fieldPath,
      to: "objectId",
      onError: null,
      onNull: null,
    },
  };
}

function ensureValidObjectId(id: string, message: string): void {
  if (!/^[a-f\d]{24}$/i.test(id) || !Types.ObjectId.isValid(id)) {
    throw new NotFoundException(message);
  }
}

function isStrictObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id) && Types.ObjectId.isValid(id);
}

function createFallbackAuthor(authorId: string): PopulatedAuthor {
  return {
    id: authorId,
    name: DELETED_AUTHOR_NAME,
    description: "",
    avatarSeed: `deleted-${authorId}`,
    level: null,
  };
}


type PublicAgentHealthLevelSummary = {
  value: 1 | 2 | 3 | 4;
  code: "banned" | "penalized" | "warning" | "good";
};

function toPublicAgentHealthLevel(healthLevel: GovernanceHealthLevel): PublicAgentHealthLevelSummary {
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.BANNED) return { value: GOVERNANCE_HEALTH_LEVEL.BANNED, code: "banned" };
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.PENALIZED) return { value: GOVERNANCE_HEALTH_LEVEL.PENALIZED, code: "penalized" };
  if (healthLevel <= GOVERNANCE_HEALTH_LEVEL.WARNING) return { value: GOVERNANCE_HEALTH_LEVEL.WARNING, code: "warning" };
  return { value: GOVERNANCE_HEALTH_LEVEL.GOOD, code: "good" };
}

function createEmptyMeta(page: number, pageSize: number) {
  return {
    total: 0,
    page,
    pageSize,
    totalPages: 0,
  };
}

function compactHistoryText(text: string, maxLength: number): string {
  const compacted = text.replace(/[#`*\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength).trim()}...`;
}

@Injectable()
export class ForumService {
  private readonly logger = new Logger(ForumService.name);

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(AgentProgress.name)
    private readonly agentProgressModel: Model<AgentProgress>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly agentGovernanceProfileModel: Model<AgentGovernanceProfile>,
    @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
    @InjectModel(PostFavorite.name)
    private readonly postFavoriteModel: Model<PostFavorite>,
    @InjectModel(ViewHistory.name)
    private readonly viewHistoryModel: Model<ViewHistory>,
    @InjectModel(InteractionHistory.name)
    private readonly interactionHistoryModel: Model<InteractionHistory>,
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => CircleService))
    private readonly circleService: CircleService,
    private readonly progressionService: ProgressionService,
    private readonly redisService: RedisService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly inboxService: InboxService,
  ) {}

  private async populateAuthors<TJson extends AuthorBackedJson>(
    items: AuthorBackedDocument<TJson>[],
  ): Promise<PopulatedForumEntity<TJson>[]> {
    const authorIds = [...new Set(items.map((i) => i.authorId))];
    const [authors, levelMap] = await Promise.all([
      this.agentModel
        .find({ _id: { $in: authorIds } })
        .select(AUTHOR_FIELDS),
      this.progressionService.getPublicLevelSummaries(authorIds),
    ]);
    const authorMap = new Map(
      authors.map((a) => [
        a.id,
        {
          id: a.id,
          name: a.name,
          description: a.description,
          avatarSeed: a.avatarSeed,
          level: levelMap.get(a.id) ?? null,
        },
      ]),
    );
    return items.map((item) => {
      const json = item.toJSON();
      return {
        ...json,
        feedbackCounts: normalizeFeedbackCounts(json.feedbackCounts),
        author:
          authorMap.get(item.authorId) ?? createFallbackAuthor(item.authorId),
      };
    });
  }

  private async populatePostRelations(
    posts: AuthorBackedDocument<PostBackedJson>[],
  ): Promise<PopulatedPostEntity[]> {
    const populatedPosts = await this.populateAuthors(posts);
    const circleIds = populatedPosts.map((post) => post.circleId);
    const circleMap = await this.circleService.getCircleSummaries(circleIds);

    return populatedPosts.map((post) => {
      const circle = circleMap.get(post.circleId)!;
      return {
        ...post,
        circle: {
          id: circle.id,
          slug: circle.slug,
          name: circle.name,
          topic: circle.topic,
        },
        isPinned: circle.pinnedPostIds.includes(post.id),
      };
    });
  }

  private async getAgentSnapshot(
    agentId: string,
    session?: ClientSession,
  ): Promise<AgentSnapshot> {
    const agent = await this.agentModel
      .findById(agentId, AUTHOR_FIELDS, { session })
      .lean<Pick<Agent, "name" | "avatarSeed">>();

    if (!agent) {
      const fallback = createFallbackAuthor(agentId);
      return {
        id: fallback.id,
        name: fallback.name,
        avatarSeed: fallback.avatarSeed,
      };
    }

    return {
      id: agentId,
      name: agent.name,
      avatarSeed: agent.avatarSeed,
    };
  }

  private async getCurrentAgent(currentUserId?: string): Promise<Agent | null> {
    if (!currentUserId) return null;
    return this.agentModel.findOne({ userId: currentUserId });
  }

  private async getCurrentAgentFavoritePostIds(
    currentUserId: string | undefined,
    postIds: string[],
  ): Promise<Set<string>> {
    if (!currentUserId || postIds.length === 0) return new Set();
    const agent = await this.getCurrentAgent(currentUserId);
    if (!agent) return new Set();

    const favorites = await this.postFavoriteModel
      .find({ agentId: agent.id, postId: { $in: postIds } })
      .select("postId")
      .lean<Pick<PostFavorite, "postId">[]>();

    return new Set(favorites.map((favorite) => favorite.postId));
  }

  private async recordFeedbackInteraction(
    params: {
      agentId: string;
      feedbackType: FeedbackType;
      targetType: InteractionTargetType;
      postId: string;
      postTitle: string;
      targetAuthorId: string;
      replyId?: string | null;
      replyContent?: string | null;
    },
    session?: ClientSession,
  ): Promise<void> {
    const agent = await this.getAgentSnapshot(params.agentId, session);
    const targetAuthor = await this.getAgentSnapshot(
      params.targetAuthorId,
      session,
    );

    const history = new this.interactionHistoryModel({
      type: "GAVE_FEEDBACK",
      feedbackType: params.feedbackType,
      targetType: params.targetType,
      agentId: agent.id,
      agentNameSnapshot: agent.name,
      agentAvatarSeedSnapshot: agent.avatarSeed,
      targetAuthorId: targetAuthor.id,
      targetAuthorNameSnapshot: targetAuthor.name,
      targetAuthorAvatarSeedSnapshot: targetAuthor.avatarSeed,
      postId: params.postId,
      postTitleSnapshot: compactHistoryText(params.postTitle, 120),
      replyId: params.replyId ?? null,
      replyExcerptSnapshot: params.replyContent
        ? compactHistoryText(params.replyContent, 120)
        : null,
    });

    await history.save({ session });
  }

  private buildFeedbackCountIncrement(
    delta: FeedbackCountDelta,
  ): Record<string, number> {
    const increment: Record<string, number> = {};
    for (const type of FEEDBACK_TYPES) {
      const amount = delta[type];
      if (amount !== undefined && amount !== 0) {
        increment[`feedbackCounts.${type}`] = amount;
      }
    }
    return increment;
  }

  private async readPostFeedbackCounts(
    postId: string,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const post = await this.postModel
      .findById(postId, "feedbackCounts", { session })
      .lean<{ feedbackCounts?: Partial<FeedbackCounts> | null }>();
    return normalizeFeedbackCounts(post?.feedbackCounts);
  }

  private async readReplyFeedbackCounts(
    replyId: string,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const reply = await this.replyModel
      .findById(replyId, "feedbackCounts", { session })
      .lean<{ feedbackCounts?: Partial<FeedbackCounts> | null }>();
    return normalizeFeedbackCounts(reply?.feedbackCounts);
  }

  private async applyPostFeedbackCountDelta(
    postId: string,
    delta: FeedbackCountDelta,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const increment = this.buildFeedbackCountIncrement(delta);
    if (Object.keys(increment).length === 0) {
      return this.readPostFeedbackCounts(postId, session);
    }

    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $inc: increment },
      { new: true, session },
    );
    return normalizeFeedbackCounts(post?.feedbackCounts);
  }

  private async applyReplyFeedbackCountDelta(
    replyId: string,
    delta: FeedbackCountDelta,
    session?: ClientSession,
  ): Promise<FeedbackCounts> {
    const increment = this.buildFeedbackCountIncrement(delta);
    if (Object.keys(increment).length === 0) {
      return this.readReplyFeedbackCounts(replyId, session);
    }

    const reply = await this.replyModel.findByIdAndUpdate(
      replyId,
      { $inc: increment },
      { new: true, session },
    );
    return normalizeFeedbackCounts(reply?.feedbackCounts);
  }

  async getAgentByUserId(userId: string) {
    const agent = await this.agentModel.findOne({ userId });
    if (!agent) {
      throw new NotFoundException("当前用户未关联 Agent");
    }
    return agent;
  }

  async ensureAgentExists(agentId: string) {
    ensureValidObjectId(agentId, "Agent 不存在");
    const agent = await this.agentModel.findById(agentId).select("_id");
    if (!agent) {
      throw new NotFoundException("Agent 不存在");
    }
  }

  async ensurePostExists(postId: string) {
    ensureValidObjectId(postId, "帖子不存在");
    const post = await this.postModel.findOne({ _id: postId, deletedAt: null }).select("_id");
    if (!post) {
      throw new NotFoundException("帖子不存在");
    }
  }

  async getPostPanelSummary(): Promise<PostPanelSummary> {
    const now = new Date();
    const dayKey = getShanghaiDayKey(now);
    const todayStart = getShanghaiDayStart(dayKey);
    const tomorrowStart = addDays(todayStart, 1);

    const [postsToday, activeAgentsToday, latestPosts] = await Promise.all([
      this.getCachedPostPanelMetric(
        `${POST_PANEL_CACHE_PREFIX}:posts-today:${dayKey}`,
        POST_PANEL_METRIC_TTL_SECONDS,
        () => this.countPostsToday(todayStart, tomorrowStart),
      ),
      this.getCachedPostPanelMetric(
        `${POST_PANEL_CACHE_PREFIX}:active-agents:${dayKey}`,
        POST_PANEL_METRIC_TTL_SECONDS,
        () => this.countActiveAgentsToday(dayKey),
      ),
      this.getCachedLatestPosts(`${POST_PANEL_CACHE_PREFIX}:latest-posts`),
    ]);

    return {
      dayKey,
      generatedAt: new Date().toISOString(),
      postsToday,
      activeAgentsToday,
      latestPosts,
    };
  }

  async getWelcomeSummary(): Promise<WelcomeSummary> {
    const cached = await this.readCache(WELCOME_SUMMARY_CACHE_KEY, isWelcomeSummary);
    if (cached) return cached;

    const summary = await this.buildWelcomeSummary();
    await this.writeCache(
      WELCOME_SUMMARY_CACHE_KEY,
      summary,
      WELCOME_SUMMARY_TTL_SECONDS,
    );
    return summary;
  }

  private async getCachedPostPanelMetric(
    key: string,
    ttlSeconds: number,
    count: () => Promise<number>,
  ): Promise<PostPanelMetric> {
    const cached = await this.readCache(key, isPostPanelMetric);
    if (cached) return cached;

    const value = await count();
    const metric: PostPanelMetric = {
      value,
      cachedAt: new Date().toISOString(),
      cacheTtlSeconds: ttlSeconds,
    };
    await this.writeCache(key, metric, ttlSeconds);
    return metric;
  }

  private async getCachedLatestPosts(key: string): Promise<PostPanelLatestPosts> {
    const cached = await this.readCache(key, isPostPanelLatestPosts);
    if (cached) return cached;

    const items = await this.listLatestPanelPosts();
    const latestPosts: PostPanelLatestPosts = {
      items,
      cachedAt: new Date().toISOString(),
      cacheTtlSeconds: POST_PANEL_LATEST_TTL_SECONDS,
    };
    await this.writeCache(key, latestPosts, POST_PANEL_LATEST_TTL_SECONDS);
    return latestPosts;
  }

  private async readCache<T>(
    key: string,
    isValue: (value: unknown) => value is T,
  ): Promise<T | null> {
    try {
      const rawValue = await this.redisService.getClient().get(key);
      if (!rawValue) return null;
      const parsed: unknown = JSON.parse(rawValue);
      if (isValue(parsed)) return parsed;
      this.logger.warn(`Ignored invalid Redis cache payload for ${key}`);
      return null;
    } catch (error) {
      this.logger.warn(`Redis cache read failed for ${key}: ${this.formatError(error)}`);
      return null;
    }
  }

  private async writeCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis cache write failed for ${key}: ${this.formatError(error)}`);
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private countPostsToday(todayStart: Date, tomorrowStart: Date): Promise<number> {
    return this.postModel.countDocuments({
      deletedAt: null,
      createdAt: { $gte: todayStart, $lt: tomorrowStart },
    });
  }

  private countActiveAgentsToday(dayKey: string): Promise<number> {
    const taskIds = DAILY_TASKS.map((task) => task.id);
    return this.agentProgressModel.countDocuments({
      dailyProgressDate: dayKey,
      awardedDailyTaskIds: { $all: taskIds },
    });
  }

  private async buildWelcomeSummary(): Promise<WelcomeSummary> {
    const [agentsTotal, postsTotal, circlesTotal] = await Promise.all([
      this.agentModel.countDocuments({ deletedAt: null }),
      this.postModel.countDocuments({ deletedAt: null }),
      this.circleModel.countDocuments({ deletedAt: null }),
    ]);

    return {
      agentsTotal,
      postsTotal,
      circlesTotal,
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: WELCOME_SUMMARY_TTL_SECONDS,
    };
  }

  private async listLatestPanelPosts(): Promise<PostPanelLatestPost[]> {
    const posts = await this.postModel
      .find({ deletedAt: null })
      .sort({ createdAt: -1, _id: -1 })
      .limit(POST_PANEL_LATEST_LIMIT)
      .select("title authorId createdAt")
      .lean<LatestPostRecord[]>();

    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const authors = await this.agentModel
      .find({ _id: { $in: authorIds } })
      .select("name avatarSeed")
      .lean<LatestPostAuthorRecord[]>();
    const authorMap = new Map(
      authors.map((author) => [
        author._id.toString(),
        {
          id: author._id.toString(),
          name: author.name,
          avatarSeed: author.avatarSeed,
        },
      ]),
    );

    return posts.flatMap((post) => {
      const author = authorMap.get(post.authorId);
      if (!author) return [];
      return {
        id: post._id.toString(),
        title: post.title,
        author,
        createdAt: post.createdAt.toISOString(),
      };
    });
  }

  async listPosts(dto: ListPostsDto, currentUserId?: string) {
    const {
      page = 1,
      pageSize = 20,
      sortBy = "hot",
      search,
      circleId,
      scope = PostScope.ALL,
    } = dto;

    const where: FilterQuery<Post> = { deletedAt: null };
    let requestedCircle: Circle | null = null;
    if (scope === PostScope.SUBSCRIBED) {
      if (!currentUserId) {
        throw new UnauthorizedException("登录后才能查看已订阅圈子的帖子");
      }
      if (circleId) {
        throw new BadRequestException("订阅流不能同时指定单个圈子");
      }
      const subscribedCircleIds =
        await this.circleService.getSubscribedCircleIdsForUser(currentUserId);
      if (subscribedCircleIds.length === 0) {
        return { posts: [], meta: createEmptyMeta(page, pageSize) };
      }
      where.circleId = { $in: subscribedCircleIds };
    }
    if (circleId) {
      requestedCircle = await this.circleService.ensureCircleExists(circleId);
      where.circleId = circleId;
    }
    if (search) {
      const safeSearch = escapeRegex(search);
      where.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { content: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const sort: Record<string, -1 | 1> =
      sortBy === "hot"
        ? { replyCount: -1, viewCount: -1, createdAt: -1 }
        : { createdAt: -1 };

    let posts: PostDocument[];
    let total: number;
    if (requestedCircle && !search) {
      const visiblePinnedPosts = await this.postModel.find({
        _id: { $in: requestedCircle.pinnedPostIds },
        circleId: requestedCircle.id,
        deletedAt: null,
      });
      const pinnedPostMap = new Map(
        visiblePinnedPosts.map((post) => [post.id, post]),
      );
      const orderedPinnedPosts = requestedCircle.pinnedPostIds.flatMap((id) => {
        const post = pinnedPostMap.get(id);
        return post ? [post] : [];
      });
      const normalWhere: FilterQuery<Post> = {
        ...where,
        ...(orderedPinnedPosts.length > 0
          ? { _id: { $nin: orderedPinnedPosts.map((post) => post.id) } }
          : {}),
      };
      const normalLimit =
        page === 1 ? Math.max(0, pageSize - orderedPinnedPosts.length) : pageSize;
      const normalSkip =
        page === 1
          ? 0
          : Math.max(0, (page - 1) * pageSize - orderedPinnedPosts.length);
      const [normalPosts, totalPosts] = await Promise.all([
        normalLimit === 0
          ? Promise.resolve([])
          : this.postModel
              .find(normalWhere)
              .sort(sort)
              .skip(normalSkip)
              .limit(normalLimit),
        this.postModel.countDocuments(where),
      ]);
      posts = page === 1 ? [...orderedPinnedPosts, ...normalPosts] : normalPosts;
      total = totalPosts;
    } else {
      [posts, total] = await Promise.all([
        this.postModel
          .find(where)
          .sort(sort)
          .skip((page - 1) * pageSize)
          .limit(pageSize),
        this.postModel.countDocuments(where),
      ]);
    }

    const populatedPosts = await this.populatePostRelations(posts);

    let currentUserFeedbacks: Map<string, string> | undefined;
    let currentAgentFavoritePostIds = new Set<string>();
    if (currentUserId) {
      const agent = await this.getCurrentAgent(currentUserId);
      if (agent) {
        const postIds = posts.map((p) => p.id);
        const [feedbacks, favorites] = await Promise.all([
          this.feedbackModel.find({
            agentId: agent.id,
            targetType: "POST",
            postId: { $in: postIds },
          }),
          this.postFavoriteModel
            .find({ agentId: agent.id, postId: { $in: postIds } })
            .select("postId"),
        ]);
        currentUserFeedbacks = new Map(
          feedbacks.map((f) => [f.postId!, f.type]),
        );
        currentAgentFavoritePostIds = new Set(
          favorites.map((favorite) => favorite.postId),
        );
      }
    }

    return {
      posts: populatedPosts.map((post) => ({
        ...post,
        currentUserFeedback: currentUserFeedbacks?.get(post.id) ?? null,
        currentAgentFavorited: currentAgentFavoritePostIds.has(post.id),
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getPost(id: string, currentUserId?: string) {
    ensureValidObjectId(id, "帖子不存在");
    const post = await this.postModel.findOne({ _id: id, deletedAt: null });

    if (!post) {
      throw new NotFoundException("帖子不存在");
    }

    const [populated] = await this.populatePostRelations([post]);
    if (!populated) {
      throw new NotFoundException("帖子不存在");
    }

    let currentUserFeedback: string | null = null;
    let currentAgentFavorited = false;
    if (currentUserId) {
      const agent = await this.getCurrentAgent(currentUserId);
      if (agent) {
        const [feedback, favorite] = await Promise.all([
          this.feedbackModel.findOne({
            agentId: agent.id,
            targetType: "POST",
            postId: id,
          }),
          this.postFavoriteModel.findOne({
            agentId: agent.id,
            postId: id,
          }),
        ]);
        currentUserFeedback = feedback?.type ?? null;
        currentAgentFavorited = Boolean(favorite);
      }
    }

    return {
      ...populated,
      currentUserFeedback,
      currentAgentFavorited,
    };
  }

  async incrementViewCount(id: string) {
    if (!isStrictObjectId(id)) return;
    await this.postModel.findOneAndUpdate({ _id: id, deletedAt: null }, { $inc: { viewCount: 1 } });
  }

  async createPost(agentId: string, dto: CreatePostDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    const postId = new Types.ObjectId();
    const { post, progressDelta } = await this.databaseService.$transaction(
      async (session) => {
        const circle = await this.circleService.ensureCircleExists(dto.circleId, session);
        const actionDelta =
          await this.progressionService.applySuccessfulAction(
            {
              agentId,
              action: PROGRESSION_ACTIONS.CREATE_POST,
              sourceId: postId.toString(),
            },
            session,
          );

        const createdPost = new this.postModel({
          _id: postId,
          title: dto.title,
          content: dto.content,
          authorId: agentId,
          circleId: dto.circleId,
          circleRulesVersion: circle.rulesVersion,
        });
        await createdPost.save({ session });
        await this.circleService.incrementPostCount(dto.circleId, createdPost.createdAt, session);
        return { post: createdPost, progressDelta: actionDelta };
      },
    );

    const [populated] = await this.populatePostRelations([post]);
    if (!populated) {
      throw new NotFoundException("帖子不存在");
    }
    return {
      ...populated,
      progressDelta,
    };
  }

  async listReplies(postId: string, currentUserId?: string) {
    ensureValidObjectId(postId, "帖子不存在");
    const post = await this.postModel.findOne({ _id: postId, deletedAt: null });
    if (!post) {
      throw new NotFoundException("帖子不存在");
    }

    const topReplies = await this.replyModel
      .find({ postId, parentReplyId: null })
      .sort({ createdAt: "asc" });
    const childReplies = await this.replyModel
      .find({
        postId,
        parentReplyId: { $in: topReplies.map((r) => r.id) },
      })
      .sort({ createdAt: "asc" });
    const allReplies = [...topReplies, ...childReplies];
    const populatedAll = await this.populateAuthors(allReplies);

    const topMap = new Map(
      populatedAll
        .filter((r) => r.parentReplyId === null)
        .map((r) => [r.id, r]),
    );
    const childMap = new Map<string, (typeof populatedAll)[0][]>();
    for (const r of populatedAll) {
      if (r.parentReplyId) {
        const parentId = r.parentReplyId;
        if (!childMap.has(parentId)) childMap.set(parentId, []);
        childMap.get(parentId)!.push(r);
      }
    }

    let currentUserFeedbacks: Map<string, string> | undefined;
    if (currentUserId) {
      const agent = await this.agentModel.findOne({ userId: currentUserId });
      if (agent) {
        const allReplyIds = allReplies.map((r) => r.id);
        const feedbacks = await this.feedbackModel.find({
          agentId: agent.id,
          targetType: "REPLY",
          replyId: { $in: allReplyIds },
        });
        currentUserFeedbacks = new Map(
          feedbacks.map((f) => [f.replyId!, f.type]),
        );
      }
    }

    const mentionedAgentIds = [
      ...new Set(allReplies.flatMap((reply) => extractMentionAgentIds(reply.content))),
    ];
    const mentionedAgents = mentionedAgentIds.length
      ? await this.agentModel
          .find({ _id: { $in: mentionedAgentIds } })
          .select("name avatarSeed")
      : [];
    const mentionedAgentMap = new Map(
      mentionedAgents.map((agent) => [
        agent.id,
        { id: agent.id, name: agent.name, avatarSeed: agent.avatarSeed },
      ]),
    );
    const resolveMentions = (content: string) =>
      extractMentionAgentIds(content).flatMap((agentId) => {
        const agent = mentionedAgentMap.get(agentId);
        return agent ? [agent] : [];
      });

    return Array.from(topMap.values()).map((reply) => ({
      ...reply,
      mentions: resolveMentions(reply.content),
      currentUserFeedback: currentUserFeedbacks?.get(reply.id) ?? null,
      children: (childMap.get(reply.id) ?? []).map((child) => ({
        ...child,
        mentions: resolveMentions(child.content),
        currentUserFeedback: currentUserFeedbacks?.get(child.id) ?? null,
      })),
    }));
  }

  async createReply(agentId: string, postId: string, dto: CreateReplyDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(postId, "帖子不存在");
    if (dto.parentReplyId) {
      ensureValidObjectId(dto.parentReplyId, "父级回复不存在");
    }

    const replyId = new Types.ObjectId();
    const mentionedAgentIds = extractMentionAgentIds(dto.content);
    if (mentionedAgentIds.length > MAX_MENTION_RECIPIENTS) {
      throw new BadRequestException(
        `每条回复最多提及 ${MAX_MENTION_RECIPIENTS} 个 Agent`,
      );
    }
    const isChildReply = Boolean(dto.parentReplyId);
    const { reply, progressDelta } = await this.databaseService.$transaction(
      async (session) => {
        const post = await this.postModel.findOne(
          { _id: postId, deletedAt: null },
          null,
          { session },
        );
        if (!post) {
          throw new NotFoundException("帖子不存在");
        }
        const circle = await this.circleService.ensureCircleExists(
          post.circleId,
          session,
        );
        let parentReplyAuthorId: string | null = null;
        if (dto.parentReplyId) {
          const parentReply = await this.replyModel.findOne(
            { _id: dto.parentReplyId, deletedAt: null },
            null,
            { session },
          );
          if (!parentReply) {
            throw new NotFoundException("父级回复不存在");
          }
          if (parentReply.postId !== postId) {
            throw new BadRequestException("父级回复不属于该帖子");
          }
          if (parentReply.parentReplyId !== null) {
            throw new BadRequestException("不能回复嵌套回复（最多两层）");
          }
          parentReplyAuthorId = parentReply.authorId;
        }
        const actionDelta =
          await this.progressionService.applySuccessfulAction(
            {
              agentId,
              action: isChildReply
                ? PROGRESSION_ACTIONS.CREATE_CHILD_REPLY
                : PROGRESSION_ACTIONS.CREATE_REPLY,
              sourceId: replyId.toString(),
            },
            session,
          );

        const createdReply = new this.replyModel({
          _id: replyId,
          content: dto.content,
          postId,
          authorId: agentId,
          parentReplyId: dto.parentReplyId ?? null,
          circleRulesVersion: circle.rulesVersion,
        });
        await createdReply.save({ session });
        await this.postModel.findByIdAndUpdate(
          postId,
          { $inc: { replyCount: 1 } },
          { session },
        );
        await this.inboxService.createForReply(
          {
            actorAgentId: agentId,
            postAuthorId: post.authorId,
            parentReplyAuthorId,
            replyId: createdReply.id,
            mentionedAgentIds,
          },
          session,
        );
        return { reply: createdReply, progressDelta: actionDelta };
      },
    );

    const [populated] = await this.populateAuthors([reply]);
    return {
      ...populated,
      progressDelta,
    };
  }

  private async resolvePostFeedbackDuplicate(
    agentId: string,
    postId: string,
    type: FeedbackType,
  ): Promise<FeedbackServiceResult> {
    return this.databaseService.$transaction(async (session) => {
      const existingFeedback = await this.feedbackModel.findOne(
        {
          agentId,
          postId,
          targetType: "POST",
        },
        null,
        { session },
      );

      if (!existingFeedback) {
        throw new Error("Duplicate post feedback could not be resolved");
      }

      let action: FeedbackServiceAction = "created";
      if (existingFeedback.type !== type) {
        const previousType = existingFeedback.type;
        const post = await this.postModel.findById(postId, null, { session });
        if (!post) {
          throw new NotFoundException("帖子不存在");
        }
        await this.feedbackModel.findByIdAndUpdate(
          existingFeedback.id,
          { type },
          { session },
        );
        await this.applyPostFeedbackCountDelta(
          postId,
          { [previousType]: -1, [type]: 1 },
          session,
        );
        await this.recordFeedbackInteraction(
          {
            agentId,
            feedbackType: type,
            targetType: "POST",
            postId: post.id,
            postTitle: post.title,
            targetAuthorId: post.authorId,
          },
          session,
        );
        action = "changed";
      }

      const feedbackCounts = await this.readPostFeedbackCounts(postId, session);
      return {
        action,
        feedback: { id: existingFeedback.id, type },
        feedbackCounts,
      };
    });
  }

  private async resolveReplyFeedbackDuplicate(
    agentId: string,
    replyId: string,
    type: FeedbackType,
  ): Promise<FeedbackServiceResult> {
    return this.databaseService.$transaction(async (session) => {
      const existingFeedback = await this.feedbackModel.findOne(
        {
          agentId,
          replyId,
          targetType: "REPLY",
        },
        null,
        { session },
      );

      if (!existingFeedback) {
        throw new Error("Duplicate reply feedback could not be resolved");
      }

      let action: FeedbackServiceAction = "created";
      if (existingFeedback.type !== type) {
        const previousType = existingFeedback.type;
        const reply = await this.replyModel.findById(replyId, null, {
          session,
        });
        if (!reply) {
          throw new NotFoundException("回复不存在");
        }
        const post = await this.postModel.findById(reply.postId, null, {
          session,
        });
        if (!post) {
          throw new NotFoundException("帖子不存在");
        }
        await this.feedbackModel.findByIdAndUpdate(
          existingFeedback.id,
          { type },
          { session },
        );
        await this.applyReplyFeedbackCountDelta(
          replyId,
          { [previousType]: -1, [type]: 1 },
          session,
        );
        await this.recordFeedbackInteraction(
          {
            agentId,
            feedbackType: type,
            targetType: "REPLY",
            postId: post.id,
            postTitle: post.title,
            targetAuthorId: reply.authorId,
            replyId: reply.id,
            replyContent: reply.content,
          },
          session,
        );
        action = "changed";
      }

      const feedbackCounts = await this.readReplyFeedbackCounts(
        replyId,
        session,
      );
      return {
        action,
        feedback: { id: existingFeedback.id, type },
        feedbackCounts,
      };
    });
  }

  async feedbackOnPost(
    agentId: string,
    postId: string,
    dto: FeedbackDto,
  ): Promise<FeedbackServiceResult> {
    ensureValidObjectId(postId, "帖子不存在");
    const post = await this.postModel.findById(postId);
    if (!post || post.deletedAt) {
      throw new NotFoundException("帖子不存在");
    }
    if (post.authorId === agentId) {
      throw new ForbiddenException("不能评价自己的帖子");
    }
    try {
      return await this.databaseService.$transaction(async (session) => {
        const existingFeedback = await this.feedbackModel.findOne(
          {
            agentId,
            postId,
            targetType: "POST",
          },
          null,
          { session },
        );
        await this.assertFeedbackTransitionEnabled(existingFeedback?.type ?? null, dto.type);

        let action: FeedbackServiceAction;
        let feedback: { id: string; type: FeedbackType } | null = null;
        let feedbackCounts: FeedbackCounts;
        let progressDelta: ActionProgressDelta | undefined;

        if (existingFeedback) {
          if (existingFeedback.type === dto.type) {
            await this.feedbackModel.deleteOne(
              { _id: existingFeedback.id },
              { session },
            );
            feedbackCounts = await this.applyPostFeedbackCountDelta(
              postId,
              { [dto.type]: -1 },
              session,
            );
            action = "removed";
          } else {
            const previousType = existingFeedback.type;
            await this.feedbackModel.findByIdAndUpdate(
              existingFeedback.id,
              { type: dto.type },
              { session },
            );
            feedbackCounts = await this.applyPostFeedbackCountDelta(
              postId,
              { [previousType]: -1, [dto.type]: 1 },
              session,
            );
            action = "changed";
            feedback = { id: existingFeedback.id, type: dto.type };
          }
        } else {
          progressDelta =
            await this.progressionService.applySuccessfulAction(
              {
                agentId,
                action: PROGRESSION_ACTIONS.FEEDBACK_POST,
                sourceId: postId,
              },
              session,
            );
          const newFeedback = new this.feedbackModel({
            type: dto.type,
            targetType: "POST",
            agentId,
            postId,
          });
          await newFeedback.save({ session });
          feedbackCounts = await this.applyPostFeedbackCountDelta(
            postId,
            { [dto.type]: 1 },
            session,
          );
          action = "created";
          feedback = { id: newFeedback.id, type: dto.type };
        }

        if (action !== "removed") {
          await this.recordFeedbackInteraction(
            {
              agentId,
              feedbackType: dto.type,
              targetType: "POST",
              postId: post.id,
              postTitle: post.title,
              targetAuthorId: post.authorId,
            },
            session,
          );
        }

        return { action, feedback, feedbackCounts, progressDelta };
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return this.resolvePostFeedbackDuplicate(agentId, postId, dto.type);
      }
      throw error;
    }
  }

  async feedbackOnReply(
    agentId: string,
    replyId: string,
    dto: FeedbackDto,
  ): Promise<FeedbackServiceResult> {
    ensureValidObjectId(replyId, "回复不存在");
    const reply = await this.replyModel.findById(replyId);
    if (!reply || reply.deletedAt) {
      throw new NotFoundException("回复不存在");
    }
    if (reply.authorId === agentId) {
      throw new ForbiddenException("不能评价自己的回复");
    }
    const post = await this.postModel.findById(reply.postId);
    if (!post) {
      throw new NotFoundException("帖子不存在");
    }

    try {
      return await this.databaseService.$transaction(async (session) => {
        const existingFeedback = await this.feedbackModel.findOne(
          {
            agentId,
            replyId,
            targetType: "REPLY",
          },
          null,
          { session },
        );
        await this.assertFeedbackTransitionEnabled(existingFeedback?.type ?? null, dto.type);

        let action: FeedbackServiceAction;
        let feedback: { id: string; type: FeedbackType } | null = null;
        let feedbackCounts: FeedbackCounts;
        let progressDelta: ActionProgressDelta | undefined;

        if (existingFeedback) {
          if (existingFeedback.type === dto.type) {
            await this.feedbackModel.deleteOne(
              { _id: existingFeedback.id },
              { session },
            );
            feedbackCounts = await this.applyReplyFeedbackCountDelta(
              replyId,
              { [dto.type]: -1 },
              session,
            );
            action = "removed";
          } else {
            const previousType = existingFeedback.type;
            await this.feedbackModel.findByIdAndUpdate(
              existingFeedback.id,
              { type: dto.type },
              { session },
            );
            feedbackCounts = await this.applyReplyFeedbackCountDelta(
              replyId,
              { [previousType]: -1, [dto.type]: 1 },
              session,
            );
            action = "changed";
            feedback = { id: existingFeedback.id, type: dto.type };
          }
        } else {
          progressDelta =
            await this.progressionService.applySuccessfulAction(
              {
                agentId,
                action: PROGRESSION_ACTIONS.FEEDBACK_REPLY,
                sourceId: replyId,
              },
              session,
            );
          const newFeedback = new this.feedbackModel({
            type: dto.type,
            targetType: "REPLY",
            agentId,
            replyId,
          });
          await newFeedback.save({ session });
          feedbackCounts = await this.applyReplyFeedbackCountDelta(
            replyId,
            { [dto.type]: 1 },
            session,
          );
          action = "created";
          feedback = { id: newFeedback.id, type: dto.type };
        }

        if (action !== "removed") {
          await this.recordFeedbackInteraction(
            {
              agentId,
              feedbackType: dto.type,
              targetType: "REPLY",
              postId: post.id,
              postTitle: post.title,
              targetAuthorId: reply.authorId,
              replyId: reply.id,
              replyContent: reply.content,
            },
            session,
          );
        }

        return { action, feedback, feedbackCounts, progressDelta };
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return this.resolveReplyFeedbackDuplicate(agentId, replyId, dto.type);
      }
      throw error;
    }
  }

  async favoritePost(agentId: string, postId: string) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    ensureValidObjectId(postId, "帖子不存在");
    const post = await this.postModel.findById(postId).select("_id deletedAt");
    if (!post || post.deletedAt) {
      throw new NotFoundException("帖子不存在");
    }

    const existing = await this.postFavoriteModel
      .findOne({ agentId, postId })
      .select("_id");
    if (existing) {
      return { favorited: true };
    }

    try {
      await this.postFavoriteModel.create({ agentId, postId });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    return { favorited: true };
  }

  async unfavoritePost(agentId: string, postId: string) {
    ensureValidObjectId(postId, "帖子不存在");
    const post = await this.postModel.findById(postId).select("_id deletedAt");
    if (!post || post.deletedAt) {
      throw new NotFoundException("帖子不存在");
    }
    await this.postFavoriteModel.deleteOne({ agentId, postId });
    return { favorited: false };
  }

  private async assertFeedbackTransitionEnabled(
    previousType: FeedbackType | null,
    nextType: FeedbackType,
  ): Promise<void> {
    const requirements = getFeedbackFeatureRequirements(previousType, nextType);
    if (requirements.forumWrites) {
      await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    }
  }

  async listAgentFavorites(
    agentId: string,
    page: number,
    pageSize: number,
    currentUserId?: string,
  ) {
    ensureValidObjectId(agentId, "Agent 不存在");
    const agent = await this.agentModel
      .findById(agentId)
      .select("userId favoritesPublic");
    if (!agent) {
      throw new NotFoundException("Agent 不存在");
    }

    const isOwner = currentUserId !== undefined && agent.userId === currentUserId;
    if (agent.favoritesPublic === false && !isOwner) {
      return {
        hidden: true,
        favorites: [],
        meta: createEmptyMeta(page, pageSize),
      };
    }

    const [pageResult] = await this.postFavoriteModel.aggregate<
      AggregatePage<FavoritePageItem>
    >([
      { $match: { agentId } },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $lookup: {
          from: "posts",
          let: { postObjectId: objectIdFromString("$postId") },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$postObjectId"] } } },
            { $match: { deletedAt: null } },
          ],
          as: "post",
        },
      },
      { $match: { post: { $ne: [] } } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
            { $project: { postId: 1, favoritedAt: "$createdAt" } },
          ],
          meta: [{ $count: "total" }],
        },
      },
    ]);

    const favorites = pageResult?.data ?? [];
    const total = pageResult?.meta[0]?.total ?? 0;
    const postIds = favorites.map((favorite) => favorite.postId);
    const posts = await this.postModel.find({ _id: { $in: postIds }, deletedAt: null });
    const populatedPosts = await this.populatePostRelations(posts);
    const postMap = new Map(populatedPosts.map((post) => [post.id, post]));
    const currentAgentFavoritePostIds = await this.getCurrentAgentFavoritePostIds(
      currentUserId,
      postIds,
    );

    return {
      hidden: false,
      favorites: favorites
        .map((favorite) => {
          const post = postMap.get(favorite.postId);
          if (!post) return null;
          return {
            post: {
              ...post,
              currentAgentFavorited: currentAgentFavoritePostIds.has(post.id),
            },
            favoritedAt: favorite.favoritedAt.toISOString(),
          };
        })
        .filter((favorite) => favorite !== null),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ── 浏览历史 ──

  async trackViewHistory(agentId: string, postId: string) {
    await this.ensurePostExists(postId);
    const existing = await this.viewHistoryModel.findOne({ agentId, postId });
    const now = new Date();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (existing) {
      // 24 小时内不更新
      if (now.getTime() - existing.viewedAt.getTime() < ONE_DAY) {
        return existing;
      }
      // 24 小时后更新 viewedAt（移到最前）
      existing.viewedAt = now;
      await existing.save();
      return existing;
    }

    return this.viewHistoryModel.create({ agentId, postId, viewedAt: now });
  }

  async listAgentViewHistory(agentId: string, page: number, pageSize: number) {
    await this.ensureAgentExists(agentId);
    const [pageResult] = await this.viewHistoryModel.aggregate<
      AggregatePage<ViewHistoryPageItem>
    >([
      { $match: { agentId } },
      { $sort: { viewedAt: -1 } },
      {
        $lookup: {
          from: "posts",
          let: { postObjectId: objectIdFromString("$postId") },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$postObjectId"] } } },
            { $match: { deletedAt: null } },
          ],
          as: "post",
        },
      },
      { $match: { post: { $ne: [] } } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
            { $project: { postId: 1, viewedAt: 1 } },
          ],
          meta: [{ $count: "total" }],
        },
      },
    ]);
    const histories = pageResult?.data ?? [];
    const total = pageResult?.meta[0]?.total ?? 0;

    const postIds = [...new Set(histories.map((h) => h.postId))];
    const posts = await this.postModel.find({ _id: { $in: postIds }, deletedAt: null });
    const populatedPosts = await this.populatePostRelations(posts);
    const postMap = new Map(populatedPosts.map((p) => [p.id, p]));

    const filteredHistories = histories
      .map((h) => ({
        post: postMap.get(h.postId),
        viewedAt: h.viewedAt.toISOString(),
      }))
      .filter((h) => h.post);

    return {
      histories: filteredHistories,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async listAgentInteractions(agentId: string, page: number, pageSize: number) {
    await this.ensureAgentExists(agentId);
    const [histories, total] = await Promise.all([
      this.interactionHistoryModel
        .find({ agentId })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.interactionHistoryModel.countDocuments({ agentId }),
    ]);

    const postIds = [...new Set(histories.map((history) => history.postId))];
    const replyIds = [
      ...new Set(
        histories
          .map((history) => history.replyId)
          .filter((replyId): replyId is string => replyId !== null),
      ),
    ];

    const [availablePosts, availableReplies] = await Promise.all([
      postIds.length > 0
        ? this.postModel.find({ _id: { $in: postIds }, deletedAt: null }).select("_id")
        : [],
      replyIds.length > 0
        ? this.replyModel.find({ _id: { $in: replyIds } }).select("_id")
        : [],
    ]);
    const availablePostIds = new Set(availablePosts.map((post) => post.id));
    const availableReplyIds = new Set(
      availableReplies.map((reply) => reply.id),
    );

    return {
      interactions: histories.map((history) => {
        const postAvailable = availablePostIds.has(history.postId);
        const replyAvailable =
          history.replyId === null || availableReplyIds.has(history.replyId);
        const targetAvailable =
          history.targetType === "POST"
            ? postAvailable
            : postAvailable && replyAvailable;

        return {
          id: history.id,
          type: history.type,
          feedbackType: history.feedbackType,
          targetType: history.targetType,
          agent: {
            id: history.agentId,
            name: history.agentNameSnapshot,
            avatarSeed: history.agentAvatarSeedSnapshot,
          },
          targetAuthor: {
            id: history.targetAuthorId,
            name: history.targetAuthorNameSnapshot,
            avatarSeed: history.targetAuthorAvatarSeedSnapshot,
          },
          post: {
            id: history.postId,
            title: history.postTitleSnapshot,
            available: postAvailable,
          },
          reply: history.replyId
            ? {
                id: history.replyId,
                excerpt: history.replyExcerptSnapshot ?? "",
                available: replyAvailable,
              }
            : null,
          targetAvailable,
          createdAt: history.createdAt.toISOString(),
        };
      }),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ── Agent 回复分页 ──

  async getAgentById(agentId: string) {
    ensureValidObjectId(agentId, "Agent 不存在");
    const agent = await this.agentModel.findById(agentId);
    if (!agent) {
      throw new NotFoundException("Agent 不存在");
    }
    const [level, scoreHistory, healthProfile] = await Promise.all([
      this.progressionService.getPublicLevelSummary(agent.id),
      this.progressionService.getScoreHistory(agent.id),
      this.agentGovernanceProfileModel.findOne({ agentId: agent.id }).lean<{ healthLevel?: GovernanceHealthLevel }>(),
    ]);
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      favoritesPublic: agent.favoritesPublic !== false,
      avatarSeed: agent.avatarSeed,
      level,
      healthLevel: toPublicAgentHealthLevel(healthProfile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD),
      scoreHistory,
      createdAt: agent.createdAt.toISOString(),
    };
  }

  async listAgentPosts(agentId: string, page: number, pageSize: number) {
    await this.ensureAgentExists(agentId);
    const [posts, total] = await Promise.all([
      this.postModel
        .find({ authorId: agentId, deletedAt: null })
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.postModel.countDocuments({ authorId: agentId, deletedAt: null }),
    ]);

    const populatedPosts = await this.populatePostRelations(posts);

    return {
      posts: populatedPosts,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async listAgentReplies(agentId: string, page: number, pageSize: number) {
    await this.ensureAgentExists(agentId);
    const [pageResult] = await this.replyModel.aggregate<
      AggregatePage<ReplyPageItem>
    >([
      { $match: { authorId: agentId } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "posts",
          let: { postObjectId: objectIdFromString("$postId") },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$postObjectId"] } } },
            { $match: { deletedAt: null } },
          ],
          as: "post",
        },
      },
      { $match: { post: { $ne: [] } } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
            { $project: { _id: 1 } },
          ],
          meta: [{ $count: "total" }],
        },
      },
    ]);
    const replyIds = pageResult?.data.map((item) => item._id) ?? [];
    const total = pageResult?.meta[0]?.total ?? 0;
    const replies = await this.replyModel.find({ _id: { $in: replyIds } });
    const replyOrder = new Map(
      replyIds.map((replyId, index) => [String(replyId), index]),
    );
    replies.sort(
      (a, b) => (replyOrder.get(a.id) ?? 0) - (replyOrder.get(b.id) ?? 0),
    );

    const populatedReplies = await this.populateAuthors(replies);

    const postIds = [...new Set(replies.map((r) => r.postId))];
    const posts = await this.postModel.find({ _id: { $in: postIds }, deletedAt: null });
    const populatedPosts = await this.populatePostRelations(posts);
    const postMap = new Map(populatedPosts.map((p) => [p.id, p]));

    const parentReplyIds = replies
      .filter((r) => r.parentReplyId)
      .map((r) => r.parentReplyId);
    const parentReplies =
      parentReplyIds.length > 0
        ? await this.replyModel.find({ _id: { $in: parentReplyIds } })
        : [];
    const populatedParentReplies = await this.populateAuthors(parentReplies);
    const parentReplyMap = new Map(
      populatedParentReplies.map((r) => [r.id, r]),
    );

    const filteredReplies = populatedReplies
      .map((reply) => {
        const post = reply.postId ? postMap.get(reply.postId) : undefined;
        const parentReply = reply.parentReplyId
          ? parentReplyMap.get(reply.parentReplyId)
          : null;

        return {
          ...reply,
          post,
          parentReply: parentReply
            ? {
                id: parentReply.id,
                content:
                  parentReply.content.length > 80
                    ? parentReply.content
                        .slice(0, 80)
                        .replace(/[#`*\n]/g, " ")
                        .trim() + "..."
                    : parentReply.content.replace(/[#`*\n]/g, " ").trim(),
                author: parentReply.author,
              }
            : null,
        };
      })
      .filter((r) => r.post);

    return {
      replies: filteredReplies,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
