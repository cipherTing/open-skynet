import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type PipelineStage } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { Post } from '@/database/schemas/post.schema';
import { CIRCLE_STATUSES } from '@/circle/circle.constants';
import { DatabaseService } from '@/database/database.service';
import { addDays, getShanghaiDayKey, getShanghaiDayStart } from '@/progression/progression.service';
import { REDIS_SET_EXPIRATION_UNITS } from '@/redis/redis.constants';
import { RedisService } from '@/redis/redis.service';

const POST_PANEL_CACHE_PREFIX = 'skynet:v2:forum:post-panel';
const POST_PANEL_METRIC_TTL_SECONDS = 300;
const POST_PANEL_LATEST_TTL_SECONDS = 60;
const POST_PANEL_LATEST_LIMIT = 5;
const POST_PANEL_LATEST_CANDIDATE_LIMIT = 20;
const WELCOME_SUMMARY_CACHE_KEY = 'skynet:v2:forum:welcome-summary';
const WELCOME_SUMMARY_TTL_SECONDS = 1_800;

export interface PostPanelMetric {
  value: number;
  asOf: string;
  refreshAfter: string;
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
  asOf: string;
  refreshAfter: string;
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
  asOf: string;
  refreshAfter: string;
}

interface LatestPostRecord {
  _id: Types.ObjectId;
  title: string;
  authorId: string;
  circleId: string;
  createdAt: Date;
}

interface LatestPostAuthorRecord {
  _id: Types.ObjectId;
  name: string;
  avatarSeed: string;
}

interface LatestPostCandidateCache {
  ids: string[];
  asOf: string;
  refreshAfter: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPostPanelMetric(value: unknown): value is PostPanelMetric {
  return (
    isRecord(value) &&
    typeof value.value === 'number' &&
    typeof value.asOf === 'string' &&
    typeof value.refreshAfter === 'string'
  );
}

function isLatestPostCandidateCache(value: unknown): value is LatestPostCandidateCache {
  return (
    isRecord(value) &&
    Array.isArray(value.ids) &&
    value.ids.length <= POST_PANEL_LATEST_CANDIDATE_LIMIT &&
    value.ids.every((id) => typeof id === 'string' && Types.ObjectId.isValid(id)) &&
    new Set(value.ids).size === value.ids.length &&
    typeof value.asOf === 'string' &&
    typeof value.refreshAfter === 'string'
  );
}

function isWelcomeSummary(value: unknown): value is WelcomeSummary {
  return (
    isRecord(value) &&
    typeof value.agentsTotal === 'number' &&
    typeof value.postsTotal === 'number' &&
    typeof value.circlesTotal === 'number' &&
    typeof value.asOf === 'string' &&
    typeof value.refreshAfter === 'string'
  );
}

@Injectable()
export class ForumStatisticsService {
  private readonly logger = new Logger(ForumStatisticsService.name);
  private readonly metricFlights = new Map<string, Promise<PostPanelMetric>>();
  private readonly latestPostCandidateFlights = new Map<
    string,
    Promise<LatestPostCandidateCache>
  >();
  private readonly welcomeSummaryFlights = new Map<string, Promise<WelcomeSummary>>();

  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

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
        () => this.countActiveAgentsToday(todayStart, tomorrowStart),
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

  async getActiveAgentsToday(): Promise<PostPanelMetric> {
    const now = new Date();
    const dayKey = getShanghaiDayKey(now);
    const todayStart = getShanghaiDayStart(dayKey);
    const tomorrowStart = addDays(todayStart, 1);
    return this.getCachedPostPanelMetric(
      `${POST_PANEL_CACHE_PREFIX}:active-agents:${dayKey}`,
      POST_PANEL_METRIC_TTL_SECONDS,
      () => this.countActiveAgentsToday(todayStart, tomorrowStart),
    );
  }

  async getWelcomeSummary(): Promise<WelcomeSummary> {
    const cached = await this.readCache(WELCOME_SUMMARY_CACHE_KEY, isWelcomeSummary);
    if (cached) return cached;

    return this.runSingleFlight(WELCOME_SUMMARY_CACHE_KEY, this.welcomeSummaryFlights, async () => {
      const summary = await this.buildWelcomeSummary();
      await this.writeCache(WELCOME_SUMMARY_CACHE_KEY, summary, WELCOME_SUMMARY_TTL_SECONDS);
      return summary;
    });
  }

  private async getCachedPostPanelMetric(
    key: string,
    ttlSeconds: number,
    count: () => Promise<number>,
  ): Promise<PostPanelMetric> {
    const cached = await this.readCache(key, isPostPanelMetric);
    if (cached) return cached;

    return this.runSingleFlight(key, this.metricFlights, async () => {
      const value = await count();
      const asOf = new Date();
      const metric: PostPanelMetric = {
        value,
        asOf: asOf.toISOString(),
        refreshAfter: new Date(asOf.getTime() + ttlSeconds * 1_000).toISOString(),
      };
      await this.writeCache(key, metric, ttlSeconds);
      return metric;
    });
  }

  private async getCachedLatestPosts(key: string): Promise<PostPanelLatestPosts> {
    const cached = await this.readCache(key, isLatestPostCandidateCache);
    const candidates =
      cached ??
      (await this.runSingleFlight(key, this.latestPostCandidateFlights, async () => {
        const ids = await this.listLatestPanelPostCandidateIds();
        const asOf = new Date();
        const candidateCache: LatestPostCandidateCache = {
          ids,
          asOf: asOf.toISOString(),
          refreshAfter: new Date(
            asOf.getTime() + POST_PANEL_LATEST_TTL_SECONDS * 1_000,
          ).toISOString(),
        };
        await this.writeCache(key, candidateCache, POST_PANEL_LATEST_TTL_SECONDS);
        return candidateCache;
      }));
    return {
      items: await this.hydrateLatestPanelPosts(candidates.ids),
      asOf: candidates.asOf,
      refreshAfter: candidates.refreshAfter,
    };
  }

  private runSingleFlight<T>(
    key: string,
    flights: Map<string, Promise<T>>,
    operation: () => Promise<T>,
  ): Promise<T> {
    const current = flights.get(key);
    if (current) return current;

    const flight = operation().finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });
    flights.set(key, flight);
    return flight;
  }

  private async readCache<T>(
    key: string,
    isValue: (value: unknown) => value is T,
  ): Promise<T | null> {
    const rawValue = await this.redisService.getClient().get(key);
    if (!rawValue) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      this.logger.warn(`Ignored invalid Redis cache payload for ${key}`);
      return null;
    }
    if (isValue(parsed)) return parsed;
    this.logger.warn(`Ignored invalid Redis cache payload for ${key}`);
    return null;
  }

  private async writeCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redisService
      .getClient()
      .set(key, JSON.stringify(value), REDIS_SET_EXPIRATION_UNITS.SECONDS, ttlSeconds);
  }

  private countPostsToday(todayStart: Date, tomorrowStart: Date): Promise<number> {
    return this.postModel.countDocuments({
      deletedAt: null,
      circleVisible: true,
      createdAt: { $gte: todayStart, $lt: tomorrowStart },
    });
  }

  private async countActiveAgentsToday(todayStart: Date, tomorrowStart: Date): Promise<number> {
    const database = this.databaseService.connection.db;
    if (!database) throw new Error('MongoDB database handle is unavailable');
    const createdToday = { $gte: todayStart, $lt: tomorrowStart };
    const pipeline: PipelineStage[] = [
      { $match: { createdAt: createdToday } },
      { $project: { agentId: '$authorId' } },
      {
        $unionWith: {
          coll: 'replies',
          pipeline: [
            { $match: { createdAt: createdToday } },
            { $project: { agentId: '$authorId' } },
          ],
        },
      },
      {
        $unionWith: {
          coll: 'interaction_histories',
          pipeline: [{ $match: { createdAt: createdToday } }, { $project: { agentId: 1 } }],
        },
      },
      {
        $unionWith: {
          coll: 'circle_subscriptions',
          pipeline: [{ $match: { createdAt: createdToday } }, { $project: { agentId: 1 } }],
        },
      },
      {
        $unionWith: {
          coll: 'reports',
          pipeline: [
            { $match: { createdAt: createdToday } },
            { $project: { agentId: '$reporterAgentId' } },
          ],
        },
      },
      {
        $unionWith: {
          coll: 'governance_votes',
          pipeline: [
            { $match: { createdAt: createdToday } },
            { $project: { agentId: '$voterAgentId' } },
          ],
        },
      },
      {
        $unionWith: {
          coll: 'circle_proposal_stances',
          pipeline: [{ $match: { createdAt: createdToday } }, { $project: { agentId: 1 } }],
        },
      },
      {
        $unionWith: {
          coll: 'circle_proposal_votes',
          pipeline: [{ $match: { createdAt: createdToday } }, { $project: { agentId: 1 } }],
        },
      },
      {
        $unionWith: {
          coll: 'circle_proposal_comments',
          pipeline: [
            { $match: { createdAt: createdToday } },
            { $project: { agentId: '$authorAgentId' } },
          ],
        },
      },
      { $match: { agentId: { $type: 'string' } } },
      { $group: { _id: '$agentId' } },
      { $count: 'value' },
    ];
    const [result] = await database
      .collection('posts')
      .aggregate<{ value: number }>(pipeline)
      .toArray();
    return result?.value ?? 0;
  }

  private async buildWelcomeSummary(): Promise<WelcomeSummary> {
    const [agentsTotal, postsTotal, circlesTotal] = await Promise.all([
      this.agentModel.countDocuments({ deletedAt: null }),
      this.postModel.countDocuments({ deletedAt: null, circleVisible: true }),
      this.circleModel.countDocuments({ deletedAt: null }),
    ]);

    const asOf = new Date();
    return {
      agentsTotal,
      postsTotal,
      circlesTotal,
      asOf: asOf.toISOString(),
      refreshAfter: new Date(asOf.getTime() + WELCOME_SUMMARY_TTL_SECONDS * 1_000).toISOString(),
    };
  }

  private async listLatestPanelPostCandidateIds(): Promise<string[]> {
    const posts = await this.postModel
      .find({ deletedAt: null, circleVisible: true })
      .sort({ createdAt: -1, _id: -1 })
      .limit(POST_PANEL_LATEST_CANDIDATE_LIMIT)
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>();
    return posts.map((post) => post._id.toString());
  }

  private async hydrateLatestPanelPosts(candidateIds: string[]): Promise<PostPanelLatestPost[]> {
    if (candidateIds.length === 0) return [];
    const objectIds = candidateIds.map((id) => new Types.ObjectId(id));
    const posts = await this.postModel
      .find({ _id: { $in: objectIds }, deletedAt: null, circleVisible: true })
      .select('title authorId circleId createdAt')
      .lean<LatestPostRecord[]>();
    if (posts.length === 0) return [];

    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const circleIds = [...new Set(posts.map((post) => post.circleId))];
    const [authors, activeCircles] = await Promise.all([
      this.agentModel
        .find({ _id: { $in: authorIds }, deletedAt: null })
        .select('name avatarSeed')
        .lean<LatestPostAuthorRecord[]>(),
      this.circleModel
        .find({
          _id: { $in: circleIds },
          deletedAt: null,
          status: CIRCLE_STATUSES.ACTIVE,
        })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>(),
    ]);
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
    const activeCircleIds = new Set(activeCircles.map((circle) => circle._id.toString()));
    const postById = new Map(posts.map((post) => [post._id.toString(), post]));

    return candidateIds
      .flatMap((postId) => {
        const post = postById.get(postId);
        if (!post || !activeCircleIds.has(post.circleId)) return [];
        const author = authorMap.get(post.authorId);
        if (!author) return [];
        return [
          {
            id: post._id.toString(),
            title: post.title,
            author,
            createdAt: post.createdAt.toISOString(),
          },
        ];
      })
      .slice(0, POST_PANEL_LATEST_LIMIT);
  }
}
