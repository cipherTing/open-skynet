import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { Post, type PostDocument } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { Feedback } from '@/database/schemas/feedback.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { PostHotParticipant } from '@/database/schemas/post-hot-participant.schema';
import { RedisService } from '@/redis/redis.service';
import { FEEDBACK_TARGET_TYPES, POSITIVE_FEEDBACK_TYPES } from '@/forum/feedback.constants';
import { forumErrors } from '@/common/errors/business-errors';
import {
  REDIS_SET_CONDITIONS,
  REDIS_SET_EXPIRATION_UNITS,
  REDIS_SET_RESULTS,
} from '@/redis/redis.constants';

export const HOT_RANKING_QUEUE = 'hot-ranking';
export const HOT_RANKING_JOB_KINDS = {
  RECOMPUTE: 'RECOMPUTE',
  REFRESH: 'REFRESH',
  DISPATCH: 'DISPATCH',
} as const;
export const HOT_RANKING_JOB_NAMES = {
  RECOMPUTE: 'recompute',
  REFRESH: 'refresh',
  DISPATCH: 'dispatch',
} as const;
export const MAX_CIRCLE_HOT_POSTS = 3;
const HOT_CANDIDATE_GENERATION_KEY = 'skynet:v1:hot-posts:generation';
const HOT_CANDIDATE_KEY_PREFIX = 'skynet:v1:hot-posts:generation:';
const HOT_CANDIDATE_READY_MEMBER = '__generation_ready__';
const HOT_CANDIDATE_REBUILD_LOCK_KEY = 'skynet:v1:hot-posts:rebuild-lock';
const HOT_CANDIDATE_REBUILD_LOCK_TTL_MS = 60_000;
const HOT_CANDIDATE_REBUILD_WAIT_MS = 100;
const HOT_CANDIDATE_LOCK_VALUE_SEPARATOR = ':';
const RELEASE_REBUILD_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
const HOT_SNAPSHOT_KEY_PREFIX = 'skynet:v1:hot-snapshot:';
const HOT_SNAPSHOT_TTL_SECONDS = 300;
export const HOT_POST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const HOT_REFRESH_BATCH_SIZE = 1000;
const HOT_SNAPSHOT_SAMPLE_SIZE = 1000;
const HOT_FILTERED_CANDIDATE_SAMPLE_LIMIT = 2_000;
const HOT_PAGE_SCAN_SIZE = 80;
const HOT_POST_MAX_PAGE_SIZE = 100;
const HOT_SNAPSHOT_REFILL_LIMIT = 3;
const HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER = 3;
const HOT_REFRESH_CONCURRENCY = 8;
const HOT_WORKER_CONCURRENCY = 4;
const HOT_DISPATCH_INTERVAL_MS = 1_000;
const HOT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const HOT_RECOMPUTE_ATTEMPTS = 4;
const HOT_RECOMPUTE_BACKOFF_MS = 1_000;
const HOT_QUEUE_FAILED_JOB_RETENTION = 100;
const HOT_DISPATCH_CLAIM_TTL_MS = 30_000;
const HOT_DISPATCH_RETRY_BASE_DELAY_MS = 1_000;
const HOT_DISPATCH_RETRY_MAX_DELAY_MS = 60_000;
const HOT_DISPATCH_RETRY_EXPONENT_CAP = 6;
const HOT_FEEDBACK_REPLY_BATCH_SIZE = 1_000;
const HOT_AGENT_LOOKUP_BATCH_SIZE = 1_000;
const HOT_EFFECTIVE_REPLY_CAP = 20;
const HOT_POSITIVE_FEEDBACK_WEIGHT = 3;
const HOT_PARTICIPANT_WEIGHT = 2;
const HOT_AGE_OFFSET_HOURS = 2;
const HOT_DECAY_EXPONENT = 1.5;
const HOT_MIN_PARTICIPANT_COUNT = 5;
const HOT_MIN_POSITIVE_OWNER_COUNT = 2;

const HOT_PARTICIPATION_KINDS = {
  REPLY: 'REPLY',
  POSITIVE_FEEDBACK: 'POSITIVE_FEEDBACK',
} as const;

type HotParticipationKind = (typeof HOT_PARTICIPATION_KINDS)[keyof typeof HOT_PARTICIPATION_KINDS];

const HOT_RANKING_SCHEDULER_IDS = {
  REFRESH: 'hot-ranking-refresh',
  DISPATCH: 'hot-ranking-dispatch',
} as const;

const HOT_RANKING_JOB_IDS = {
  INITIAL_REFRESH: 'hot-ranking-initial-refresh',
} as const;

function shuffleCandidateIds(ids: string[]): string[] {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export interface HotPostQueryOptions {
  circleId?: string;
  circleIds?: string[];
  candidateFilter?: FilterQuery<Post>;
  filterKey: string;
  limit: number;
  cursor?: string;
}

export interface HotPostPage {
  posts: PostDocument[];
  nextCursor: string | null;
}

interface HotSnapshot {
  filterHash: string;
  ids: string[];
}

interface HotSnapshotCursor {
  snapshotId: string;
  offset: number;
  filterHash: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseHotSnapshot(value: string): HotSnapshot | null {
  const parsed = parseJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.filterHash !== 'string' ||
    !Array.isArray(parsed.ids) ||
    !parsed.ids.every((id) => typeof id === 'string')
  ) {
    return null;
  }
  return { filterHash: parsed.filterHash, ids: parsed.ids };
}

type HotRankingJob =
  | { kind: typeof HOT_RANKING_JOB_KINDS.RECOMPUTE; postId: string; signalVersion: number }
  | { kind: typeof HOT_RANKING_JOB_KINDS.REFRESH }
  | { kind: typeof HOT_RANKING_JOB_KINDS.DISPATCH };

interface ReplyActivitySource {
  _id: string;
  lastActiveAt: Date;
  replyCount: number;
}

interface FeedbackActivitySource {
  _id: string;
  lastActiveAt: Date;
}

interface ReplyIdSource {
  _id: Types.ObjectId;
}

interface AgentOwner {
  _id: Types.ObjectId;
  userId: string;
}

interface HotCandidateRecord {
  _id: Types.ObjectId;
  circleId: string;
}

interface ParticipantState {
  ownerUserId: string;
  lastAgentId: string;
  replied: boolean;
  positiveFeedback: boolean;
  lastActiveAt: Date;
}

function encodeCursor(cursor: HotSnapshotCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(cursor: string): HotSnapshotCursor | null {
  const parsed = parseJson(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (
    !isRecord(parsed) ||
    typeof parsed.snapshotId !== 'string' ||
    typeof parsed.filterHash !== 'string' ||
    typeof parsed.offset !== 'number' ||
    !Number.isInteger(parsed.offset) ||
    parsed.offset < 0
  ) {
    return null;
  }
  return {
    snapshotId: parsed.snapshotId,
    filterHash: parsed.filterHash,
    offset: parsed.offset,
  };
}

function hashFilterKey(filterKey: string): string {
  return createHash('sha256').update(filterKey).digest('hex');
}

function toObjectIds(ids: string[]): Types.ObjectId[] {
  return ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function ageHours(date: Date, now: Date): number {
  return Math.max(0, (now.getTime() - date.getTime()) / (60 * 60 * 1000));
}

function getGlobalCandidateKey(generation: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generation}:all`;
}

function getCircleCandidateKey(generation: string, circleId: string): string {
  return `${HOT_CANDIDATE_KEY_PREFIX}${generation}:circle:${circleId}`;
}

function getRebuildingGeneration(lockValue: string | null): string | null {
  if (!lockValue) return null;
  const separatorIndex = lockValue.indexOf(HOT_CANDIDATE_LOCK_VALUE_SEPARATOR);
  if (separatorIndex < 1 || separatorIndex === lockValue.length - 1) return null;
  return lockValue.slice(separatorIndex + HOT_CANDIDATE_LOCK_VALUE_SEPARATOR.length);
}

function interleaveCandidateIds(candidatePages: string[][]): string[] {
  const uniqueIds = new Set<string>();
  const maxPageLength = Math.max(0, ...candidatePages.map((page) => page.length));
  for (let index = 0; index < maxPageLength; index += 1) {
    for (const page of candidatePages) {
      const id = page[index];
      if (id && id !== HOT_CANDIDATE_READY_MEMBER) uniqueIds.add(id);
    }
  }
  return [...uniqueIds];
}

@Injectable()
export class HotRankingService implements OnModuleInit {
  private readonly logger = new Logger(HotRankingService.name);
  private candidateRebuildPromise: Promise<string> | null = null;

  constructor(
    @InjectQueue(HOT_RANKING_QUEUE)
    private readonly queue: Queue<HotRankingJob>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(PostHotParticipant.name)
    private readonly participantModel: Model<PostHotParticipant>,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.getCandidateGeneration();
    await this.queue.upsertJobScheduler(
      HOT_RANKING_SCHEDULER_IDS.REFRESH,
      { every: HOT_REFRESH_INTERVAL_MS },
      {
        name: HOT_RANKING_JOB_NAMES.REFRESH,
        data: { kind: HOT_RANKING_JOB_KINDS.REFRESH },
        opts: { removeOnComplete: true, removeOnFail: HOT_QUEUE_FAILED_JOB_RETENTION },
      },
    );
    await this.queue.upsertJobScheduler(
      HOT_RANKING_SCHEDULER_IDS.DISPATCH,
      { every: HOT_DISPATCH_INTERVAL_MS },
      {
        name: HOT_RANKING_JOB_NAMES.DISPATCH,
        data: { kind: HOT_RANKING_JOB_KINDS.DISPATCH },
        opts: { removeOnComplete: true, removeOnFail: HOT_QUEUE_FAILED_JOB_RETENTION },
      },
    );
    await this.queue.add(
      HOT_RANKING_JOB_NAMES.REFRESH,
      { kind: HOT_RANKING_JOB_KINDS.REFRESH },
      {
        jobId: HOT_RANKING_JOB_IDS.INITIAL_REFRESH,
        delay: HOT_DISPATCH_INTERVAL_MS,
        removeOnComplete: true,
        removeOnFail: HOT_QUEUE_FAILED_JOB_RETENTION,
      },
    );
  }

  async markPostDirty(postId: string, session: ClientSession): Promise<void> {
    const result = await this.postModel.updateOne(
      { _id: postId, deletedAt: { $exists: true } },
      {
        $inc: { hotSignalVersion: 1 },
        $set: {
          hotDirty: true,
          hotDispatchAt: null,
          hotDispatchClaimedUntil: null,
          hotDispatchAttempts: 0,
        },
      },
      { session, timestamps: false },
    );
    if (result.matchedCount !== 1) {
      throw new Error(`无法标记帖子热度状态: ${postId}`);
    }
  }

  private async enqueuePostRecompute(postId: string, signalVersion: number): Promise<void> {
    await this.queue.add(
      HOT_RANKING_JOB_NAMES.RECOMPUTE,
      {
        kind: HOT_RANKING_JOB_KINDS.RECOMPUTE,
        postId,
        signalVersion,
      },
      {
        attempts: HOT_RECOMPUTE_ATTEMPTS,
        backoff: { type: 'exponential', delay: HOT_RECOMPUTE_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: HOT_QUEUE_FAILED_JOB_RETENTION,
        deduplication: {
          id: `post:${postId}`,
          keepLastIfActive: true,
        },
      },
    );
  }

  /**
   * 从 Redis 候选池随机抽样，并用短时快照支持游标。候选池本身不设全站数量上限，
   * 快照只是一次浏览窗口，避免对 MongoDB 做深分页和随机全表扫描。
   */
  async listRandomHotPosts(
    where: FilterQuery<Post>,
    options: HotPostQueryOptions,
  ): Promise<HotPostPage> {
    const limit = Math.min(HOT_POST_MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.limit)));
    const filterHash = hashFilterKey(options.filterKey);
    let snapshotId: string;
    let ids: string[];
    let offset: number;

    if (options.cursor) {
      const decoded = decodeCursor(options.cursor);
      if (!decoded || decoded.filterHash !== filterHash) {
        throw forumErrors.hotCursorInvalid();
      }
      const snapshotRaw = await this.redisService
        .getClient()
        .get(`${HOT_SNAPSHOT_KEY_PREFIX}${decoded.snapshotId}`);
      if (!snapshotRaw) throw forumErrors.hotCursorExpired();
      const snapshot = parseHotSnapshot(snapshotRaw);
      if (!snapshot || snapshot.filterHash !== filterHash) {
        throw forumErrors.hotCursorInvalid();
      }
      if (decoded.offset > snapshot.ids.length) {
        throw forumErrors.hotCursorInvalid();
      }
      snapshotId = decoded.snapshotId;
      ids = snapshot.ids;
      offset = decoded.offset;
    } else {
      snapshotId = randomUUID();
      ids = await this.sampleCandidateIds(
        options.circleId,
        HOT_SNAPSHOT_SAMPLE_SIZE,
        options.circleIds,
        options.candidateFilter,
      );
      const snapshot: HotSnapshot = { filterHash, ids };
      await this.redisService
        .getClient()
        .set(
          `${HOT_SNAPSHOT_KEY_PREFIX}${snapshotId}`,
          JSON.stringify(snapshot),
          REDIS_SET_EXPIRATION_UNITS.SECONDS,
          HOT_SNAPSHOT_TTL_SECONDS,
        );
      offset = 0;
    }

    const posts: PostDocument[] = [];
    const hotCutoff = new Date(Date.now() - HOT_POST_WINDOW_MS);
    const seenIds = new Set(ids);
    let refillCount = 0;
    while (posts.length < limit) {
      while (offset < ids.length && posts.length < limit) {
        const scanStart = offset;
        const scanIds = ids.slice(scanStart, scanStart + HOT_PAGE_SCAN_SIZE);
        const objectIds = toObjectIds(scanIds);
        if (objectIds.length === 0) {
          await this.removeCandidateIds(scanIds, options.circleId, !options.circleId);
          offset = scanStart + scanIds.length;
          continue;
        }
        const [validRows, rows] = await Promise.all([
          this.postModel
            .find({
              _id: { $in: objectIds },
              deletedAt: null,
              hotEligible: true,
              hotLastActiveAt: { $gte: hotCutoff },
            })
            .select('_id circleId')
            .lean<HotCandidateRecord[]>(),
          this.postModel.find({
            ...where,
            _id: { $in: objectIds },
            deletedAt: null,
            hotEligible: true,
            hotLastActiveAt: { $gte: hotCutoff },
          }),
        ]);
        const validById = new Map(validRows.map((row) => [row._id.toString(), row]));
        const staleGlobalIds = scanIds.filter((id) => !validById.has(id));
        const staleCircleIds = options.circleId
          ? scanIds.filter((id) => validById.get(id)?.circleId !== options.circleId)
          : [];
        if (staleGlobalIds.length > 0) await this.removeCandidateIds(staleGlobalIds);
        if (staleCircleIds.length > 0 && options.circleId) {
          await this.removeCandidateIds(staleCircleIds, options.circleId, false);
        }
        const rowMap = new Map(rows.map((row) => [row.id, row]));
        let consumed = 0;
        for (const id of scanIds) {
          consumed += 1;
          const post = rowMap.get(id);
          if (post) posts.push(post);
          if (posts.length >= limit) break;
        }
        offset = scanStart + consumed;
      }

      if (posts.length >= limit || refillCount >= HOT_SNAPSHOT_REFILL_LIMIT) break;
      const additionalIds = (
        await this.sampleCandidateIds(
          options.circleId,
          HOT_SNAPSHOT_SAMPLE_SIZE,
          options.circleIds,
          options.candidateFilter,
        )
      ).filter((id) => !seenIds.has(id));
      if (additionalIds.length === 0) break;
      additionalIds.forEach((id) => seenIds.add(id));
      ids.push(...additionalIds);
      refillCount += 1;
      await this.redisService
        .getClient()
        .set(
          `${HOT_SNAPSHOT_KEY_PREFIX}${snapshotId}`,
          JSON.stringify({ filterHash, ids }),
          REDIS_SET_EXPIRATION_UNITS.SECONDS,
          HOT_SNAPSHOT_TTL_SECONDS,
        );
    }

    return {
      posts,
      nextCursor: offset < ids.length ? encodeCursor({ snapshotId, offset, filterHash }) : null,
    };
  }

  async getCircleHotPosts(
    circleId: string,
    limit = MAX_CIRCLE_HOT_POSTS,
  ): Promise<Array<{ id: string; title: string; createdAt: string }>> {
    return (await this.getCirclesHotPosts([circleId], limit)).get(circleId) ?? [];
  }

  async getCirclesHotPosts(
    circleIds: string[],
    limit = MAX_CIRCLE_HOT_POSTS,
  ): Promise<Map<string, Array<{ id: string; title: string; createdAt: string }>>> {
    const uniqueCircleIds = [...new Set(circleIds)];
    const result = new Map<string, Array<{ id: string; title: string; createdAt: string }>>(
      uniqueCircleIds.map((circleId) => [circleId, []]),
    );
    if (uniqueCircleIds.length === 0) return result;

    const pageSize = Math.min(MAX_CIRCLE_HOT_POSTS, Math.max(1, Math.trunc(limit)));
    const generation = await this.getCandidateGeneration();
    const candidateIdsByCircle = new Map<string, string[]>();
    const candidatePages = await Promise.all(
      uniqueCircleIds.map((circleId) =>
        this.redisService
          .getClient()
          .srandmember(
            getCircleCandidateKey(generation, circleId),
            pageSize * HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER,
          ),
      ),
    );
    uniqueCircleIds.forEach((circleId, index) => {
      candidateIdsByCircle.set(circleId, [...new Set(candidatePages[index])]);
    });

    const candidateIds = [...new Set([...candidateIdsByCircle.values()].flat())];
    if (candidateIds.length === 0) return result;
    const hotCutoff = new Date(Date.now() - HOT_POST_WINDOW_MS);
    const posts = await this.postModel
      .find({
        _id: { $in: toObjectIds(candidateIds) },
        deletedAt: null,
        hotEligible: true,
        hotLastActiveAt: { $gte: hotCutoff },
      })
      .select('_id circleId title createdAt');
    const postMap = new Map(posts.map((post) => [post.id, post]));

    for (const circleId of uniqueCircleIds) {
      const circleCandidateIds = candidateIdsByCircle.get(circleId) ?? [];
      const staleGlobalIds = circleCandidateIds.filter((postId) => !postMap.has(postId));
      const staleCircleIds = circleCandidateIds.filter((postId) => {
        const post = postMap.get(postId);
        return !post || post.circleId !== circleId;
      });
      if (staleGlobalIds.length > 0) await this.removeCandidateIds(staleGlobalIds);
      if (staleCircleIds.length > 0) {
        await this.removeCandidateIds(staleCircleIds, circleId, false);
      }
      const rows = circleCandidateIds.flatMap((postId) => {
        const post = postMap.get(postId);
        if (!post || post.circleId !== circleId) return [];
        return [{ id: post.id, title: post.title, createdAt: post.createdAt.toISOString() }];
      });
      result.set(circleId, rows.slice(0, pageSize));
    }
    return result;
  }

  async recomputePost(postId: string, expectedSignalVersion?: number): Promise<void> {
    const post = await this.postModel
      // Explicitly include soft-deleted documents so their circle can be removed
      // from both candidate sets. The global soft-delete plugin otherwise adds
      // `deletedAt: null` to this query.
      .findOne({ _id: postId, deletedAt: { $exists: true } })
      .select(
        'authorId circleId createdAt deletedAt hotSignalVersion hotComputedSignalVersion hotScore hotLastActiveAt hotEligible',
      );
    if (!post) {
      await this.removePostFromCandidates(postId);
      await this.participantModel.deleteMany({ postId });
      return;
    }
    if (post.deletedAt) {
      await this.removePostFromCandidates(postId, post.circleId);
      await this.participantModel.deleteMany({ postId });
      const signalVersion = post.hotSignalVersion ?? 0;
      await this.postModel.updateOne(
        {
          _id: postId,
          deletedAt: { $ne: null },
          hotSignalVersion: signalVersion,
        },
        {
          $set: {
            hotEligible: false,
            hotComputedSignalVersion: signalVersion,
            hotDirty: false,
            hotUpdatedAt: new Date(),
            hotDispatchAt: null,
            hotDispatchClaimedUntil: null,
            hotDispatchAttempts: 0,
          },
        },
        { timestamps: false },
      );
      return;
    }

    const replyActivities = await this.replyModel.aggregate<ReplyActivitySource>([
      { $match: { postId, deletedAt: null } },
      {
        $group: {
          _id: '$authorId',
          lastActiveAt: { $max: '$createdAt' },
          replyCount: { $sum: 1 },
        },
      },
    ]);
    const feedbackActivityByAgent = new Map<string, Date>();
    const mergeFeedbackActivities = (activities: FeedbackActivitySource[]): void => {
      for (const activity of activities) {
        const previous = feedbackActivityByAgent.get(activity._id);
        feedbackActivityByAgent.set(
          activity._id,
          previous ? maxDate(previous, activity.lastActiveAt) : activity.lastActiveAt,
        );
      }
    };
    mergeFeedbackActivities(
      await this.feedbackModel.aggregate<FeedbackActivitySource>([
        {
          $match: {
            targetType: FEEDBACK_TARGET_TYPES.POST,
            postId,
            type: { $in: POSITIVE_FEEDBACK_TYPES },
          },
        },
        {
          $group: {
            _id: '$agentId',
            lastActiveAt: { $max: { $ifNull: ['$updatedAt', '$createdAt'] } },
          },
        },
      ]),
    );

    const replyCursor = this.replyModel
      .find({ postId, deletedAt: null })
      .select('_id')
      .lean<ReplyIdSource>()
      .cursor();
    let replyIdBatch: string[] = [];
    const loadReplyFeedbackActivities = async (): Promise<void> => {
      if (replyIdBatch.length === 0) return;
      const currentBatch = replyIdBatch;
      replyIdBatch = [];
      mergeFeedbackActivities(
        await this.feedbackModel.aggregate<FeedbackActivitySource>([
          {
            $match: {
              targetType: FEEDBACK_TARGET_TYPES.REPLY,
              replyId: { $in: currentBatch },
              type: { $in: POSITIVE_FEEDBACK_TYPES },
            },
          },
          {
            $group: {
              _id: '$agentId',
              lastActiveAt: { $max: { $ifNull: ['$updatedAt', '$createdAt'] } },
            },
          },
        ]),
      );
    };
    for await (const reply of replyCursor) {
      replyIdBatch.push(reply._id.toString());
      if (replyIdBatch.length >= HOT_FEEDBACK_REPLY_BATCH_SIZE) {
        await loadReplyFeedbackActivities();
      }
    }
    await loadReplyFeedbackActivities();

    const sourceAgentIds = [
      ...new Set([
        ...replyActivities.map((activity) => activity._id),
        ...feedbackActivityByAgent.keys(),
        post.authorId,
      ]),
    ].filter((agentId) => Types.ObjectId.isValid(agentId));
    const ownerByAgent = new Map<string, string>();
    for (let offset = 0; offset < sourceAgentIds.length; offset += HOT_AGENT_LOOKUP_BATCH_SIZE) {
      const batch = sourceAgentIds.slice(offset, offset + HOT_AGENT_LOOKUP_BATCH_SIZE);
      const agents = await this.agentModel
        .find({ _id: { $in: toObjectIds(batch) }, deletedAt: null })
        .select('_id userId')
        .lean<AgentOwner[]>();
      agents.forEach((agent) => ownerByAgent.set(agent._id.toString(), agent.userId));
    }
    const authorOwner = ownerByAgent.get(post.authorId);
    if (!authorOwner) {
      throw new Error(`帖子作者不存在，无法计算热度: ${post.authorId}`);
    }

    const participants = new Map<string, ParticipantState>();
    const addParticipant = (agentId: string, activityAt: Date, kind: HotParticipationKind) => {
      if (agentId === post.authorId) return;
      const ownerUserId = ownerByAgent.get(agentId);
      if (!ownerUserId || ownerUserId === authorOwner) return;
      const existing = participants.get(ownerUserId);
      if (existing) {
        if (kind === HOT_PARTICIPATION_KINDS.REPLY) existing.replied = true;
        else existing.positiveFeedback = true;
        if (activityAt.getTime() >= existing.lastActiveAt.getTime()) {
          existing.lastActiveAt = activityAt;
          existing.lastAgentId = agentId;
        }
        return;
      }
      participants.set(ownerUserId, {
        ownerUserId,
        lastAgentId: agentId,
        replied: kind === HOT_PARTICIPATION_KINDS.REPLY,
        positiveFeedback: kind === HOT_PARTICIPATION_KINDS.POSITIVE_FEEDBACK,
        lastActiveAt: activityAt,
      });
    };

    for (const activity of replyActivities) {
      addParticipant(activity._id, activity.lastActiveAt, HOT_PARTICIPATION_KINDS.REPLY);
    }
    for (const [agentId, lastActiveAt] of feedbackActivityByAgent) {
      addParticipant(agentId, lastActiveAt, HOT_PARTICIPATION_KINDS.POSITIVE_FEEDBACK);
    }

    const now = new Date();
    let lastActiveAt = post.createdAt;
    for (const participant of participants.values()) {
      lastActiveAt = maxDate(lastActiveAt, participant.lastActiveAt);
    }
    const participantCount = participants.size;
    const positiveOwnerCount = [...participants.values()].filter(
      (participant) => participant.positiveFeedback,
    ).length;
    const effectiveReplyCount = replyActivities.reduce((count, activity) => {
      const activityOwner = ownerByAgent.get(activity._id);
      return activity._id === post.authorId || !activityOwner || activityOwner === authorOwner
        ? count
        : count + activity.replyCount;
    }, 0);
    const engagement =
      positiveOwnerCount * HOT_POSITIVE_FEEDBACK_WEIGHT +
      participantCount * HOT_PARTICIPANT_WEIGHT +
      Math.min(HOT_EFFECTIVE_REPLY_CAP, effectiveReplyCount);
    const score =
      engagement / (ageHours(lastActiveAt, now) + HOT_AGE_OFFSET_HOURS) ** HOT_DECAY_EXPONENT;
    const eligible =
      now.getTime() - lastActiveAt.getTime() <= HOT_POST_WINDOW_MS &&
      participantCount >= HOT_MIN_PARTICIPANT_COUNT &&
      positiveOwnerCount >= HOT_MIN_POSITIVE_OWNER_COUNT;
    const signalVersion = post.hotSignalVersion ?? 0;
    const updateResult = await this.postModel.updateOne(
      { _id: postId, hotSignalVersion: signalVersion },
      {
        $set: {
          hotScore: Number.isFinite(score) ? score : 0,
          hotLastActiveAt: lastActiveAt,
          hotEligible: eligible,
          hotUpdatedAt: now,
          hotComputedSignalVersion: signalVersion,
        },
      },
      { timestamps: false },
    );
    if (updateResult.matchedCount !== 1) return;

    // 先用 signalVersion 条件落地帖子，再写参与者快照。这样旧任务即使
    // 与新互动并发，也不会用旧数据覆盖最新的参与者状态。
    if (participants.size === 0) {
      await this.participantModel.deleteMany({ postId });
    } else {
      const operations = [...participants.values()].map((participant) => ({
        updateOne: {
          filter: { postId, ownerUserId: participant.ownerUserId },
          update: { $set: { ...participant } },
          upsert: true,
        },
      }));
      await this.participantModel.bulkWrite(operations, { ordered: false });
      await this.participantModel.deleteMany({
        postId,
        ownerUserId: { $nin: [...participants.keys()] },
      });
    }
    if (expectedSignalVersion !== undefined && expectedSignalVersion !== signalVersion) {
      this.logger.debug(`帖子 ${postId} 使用最新热度版本重算（旧版本 ${expectedSignalVersion}）`);
    }
    await this.updateCandidates(postId, post.circleId, eligible);
    await this.postModel.updateOne(
      {
        _id: postId,
        hotSignalVersion: signalVersion,
        hotComputedSignalVersion: signalVersion,
      },
      {
        $set: {
          hotDirty: false,
          hotDispatchAt: null,
          hotDispatchClaimedUntil: null,
          hotDispatchAttempts: 0,
        },
      },
      { timestamps: false },
    );
  }

  async refreshRecentCandidates(): Promise<void> {
    const cutoff = new Date(Date.now() - HOT_POST_WINDOW_MS);
    await this.getCandidateGeneration();
    const [eligible, expiredEligible] = await Promise.all([
      this.postModel
        .find({ deletedAt: null, hotEligible: true })
        .sort({ hotScore: -1, _id: -1 })
        .limit(HOT_REFRESH_BATCH_SIZE)
        .select('_id'),
      this.postModel
        .find({
          deletedAt: null,
          hotEligible: true,
          $or: [{ hotLastActiveAt: null }, { hotLastActiveAt: { $lt: cutoff } }],
        })
        .sort({ hotLastActiveAt: 1, _id: 1 })
        .limit(HOT_REFRESH_BATCH_SIZE)
        .select('_id'),
    ]);
    const ids = [
      ...new Set([...eligible.map((post) => post.id), ...expiredEligible.map((post) => post.id)]),
    ];
    for (let offset = 0; offset < ids.length; offset += HOT_REFRESH_CONCURRENCY) {
      const batch = ids.slice(offset, offset + HOT_REFRESH_CONCURRENCY);
      const versions = await this.postModel
        .find({ _id: { $in: batch }, deletedAt: null })
        .select('_id hotSignalVersion')
        .lean<Array<{ _id: Types.ObjectId; hotSignalVersion: number }>>();
      await Promise.all(
        versions.map((post) =>
          this.enqueuePostRecompute(post._id.toString(), post.hotSignalVersion),
        ),
      );
    }
  }

  async dispatchDirtyPosts(): Promise<void> {
    const now = new Date();
    const dirtyPosts = await this.postModel
      .find({
        deletedAt: { $exists: true },
        hotDirty: true,
        $and: [
          {
            $or: [
              { hotDispatchAt: null },
              { hotDispatchAt: { $lte: now } },
              { hotDispatchAt: { $exists: false } },
            ],
          },
          {
            $or: [
              { hotDispatchClaimedUntil: null },
              { hotDispatchClaimedUntil: { $lte: now } },
              { hotDispatchClaimedUntil: { $exists: false } },
            ],
          },
        ],
      })
      .sort({ hotDispatchAt: 1, _id: 1 })
      .limit(HOT_REFRESH_BATCH_SIZE)
      .select('_id hotSignalVersion hotDispatchAttempts')
      .lean<
        Array<{ _id: Types.ObjectId; hotSignalVersion: number; hotDispatchAttempts: number }>
      >();

    const errors: Error[] = [];
    await Promise.all(
      dirtyPosts.map(async (post) => {
        const claimUntil = new Date(now.getTime() + HOT_DISPATCH_CLAIM_TTL_MS);
        const claimed = await this.postModel.updateOne(
          {
            _id: post._id,
            hotDirty: true,
            hotSignalVersion: post.hotSignalVersion,
            $or: [
              { hotDispatchClaimedUntil: null },
              { hotDispatchClaimedUntil: { $lte: now } },
              { hotDispatchClaimedUntil: { $exists: false } },
            ],
          },
          {
            $set: {
              hotDispatchClaimedUntil: claimUntil,
              hotDispatchAt: null,
            },
            $inc: { hotDispatchAttempts: 1 },
          },
          { timestamps: false },
        );
        if (claimed.matchedCount !== 1) return;

        try {
          await this.enqueuePostRecompute(post._id.toString(), post.hotSignalVersion);
        } catch (error) {
          const attempts = (post.hotDispatchAttempts ?? 0) + 1;
          const retryDelay = Math.min(
            HOT_DISPATCH_RETRY_MAX_DELAY_MS,
            HOT_DISPATCH_RETRY_BASE_DELAY_MS *
              2 ** Math.min(attempts - 1, HOT_DISPATCH_RETRY_EXPONENT_CAP),
          );
          await this.postModel.updateOne(
            {
              _id: post._id,
              hotDirty: true,
              hotSignalVersion: post.hotSignalVersion,
            },
            {
              $set: {
                hotDispatchAt: new Date(now.getTime() + retryDelay),
                hotDispatchClaimedUntil: null,
              },
            },
            { timestamps: false },
          );
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }),
    );
    if (errors.length > 0) throw errors[0];
  }

  private async rebuildCandidatePool(generation: string): Promise<string> {
    const redis = this.redisService.getClient();
    const cutoff = new Date(Date.now() - HOT_POST_WINDOW_MS);
    let cursor: Types.ObjectId | null = null;
    const globalKey = getGlobalCandidateKey(generation);
    await redis.sadd(globalKey, HOT_CANDIDATE_READY_MEMBER);
    while (true) {
      const where: FilterQuery<Post> = {
        deletedAt: null,
        hotEligible: true,
        hotLastActiveAt: { $gte: cutoff },
        ...(cursor ? { _id: { $gt: cursor } } : {}),
      };
      const batch = await this.postModel
        .find(where)
        .sort({ _id: 1 })
        .limit(HOT_REFRESH_BATCH_SIZE)
        .select('_id circleId')
        .lean<HotCandidateRecord[]>();
      if (batch.length === 0) break;
      await redis.sadd(globalKey, ...batch.map((post) => post._id.toString()));
      const byCircle = new Map<string, string[]>();
      for (const post of batch) {
        const ids = byCircle.get(post.circleId) ?? [];
        ids.push(post._id.toString());
        byCircle.set(post.circleId, ids);
      }
      await Promise.all(
        [...byCircle].map(([circleId, ids]) => {
          const key = getCircleCandidateKey(generation, circleId);
          return redis.sadd(key, ...ids);
        }),
      );
      cursor = batch[batch.length - 1]._id;
      if (batch.length < HOT_REFRESH_BATCH_SIZE) break;
    }
    await redis.set(HOT_CANDIDATE_GENERATION_KEY, generation);
    return generation;
  }

  private async findReadyCandidateGeneration(): Promise<string | null> {
    const redis = this.redisService.getClient();
    const generation = await redis.get(HOT_CANDIDATE_GENERATION_KEY);
    if (
      generation &&
      (await redis.sismember(getGlobalCandidateKey(generation), HOT_CANDIDATE_READY_MEMBER)) === 1
    ) {
      return generation;
    }
    return null;
  }

  private async rebuildCandidatePoolWithLock(): Promise<string> {
    const redis = this.redisService.getClient();
    while (true) {
      const readyGeneration = await this.findReadyCandidateGeneration();
      if (readyGeneration) return readyGeneration;

      const lockToken = randomUUID();
      const generation = randomUUID();
      const lockValue = `${lockToken}${HOT_CANDIDATE_LOCK_VALUE_SEPARATOR}${generation}`;
      const lockResult = await redis.set(
        HOT_CANDIDATE_REBUILD_LOCK_KEY,
        lockValue,
        REDIS_SET_EXPIRATION_UNITS.MILLISECONDS,
        HOT_CANDIDATE_REBUILD_LOCK_TTL_MS,
        REDIS_SET_CONDITIONS.IF_NOT_EXISTS,
      );
      if (lockResult === REDIS_SET_RESULTS.STORED) {
        try {
          const generationAfterLock = await this.findReadyCandidateGeneration();
          return generationAfterLock ?? (await this.rebuildCandidatePool(generation));
        } finally {
          await redis.eval(
            RELEASE_REBUILD_LOCK_SCRIPT,
            1,
            HOT_CANDIDATE_REBUILD_LOCK_KEY,
            lockValue,
          );
        }
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, HOT_CANDIDATE_REBUILD_WAIT_MS);
      });
    }
  }

  private async getCandidateGeneration(): Promise<string> {
    const generation = await this.findReadyCandidateGeneration();
    if (generation) return generation;
    if (!this.candidateRebuildPromise) {
      this.candidateRebuildPromise = this.rebuildCandidatePoolWithLock().finally(() => {
        this.candidateRebuildPromise = null;
      });
    }
    return this.candidateRebuildPromise;
  }

  private async sampleCandidateIds(
    circleId: string | undefined,
    count: number,
    circleIds: string[] | undefined,
    candidateFilter: FilterQuery<Post> | undefined,
  ): Promise<string[]> {
    const generation = await this.getCandidateGeneration();
    if (candidateFilter) {
      const boundary = new Types.ObjectId();
      const sampleLimit = Math.max(1, Math.min(count, HOT_FILTERED_CANDIDATE_SAMPLE_LIMIT));
      const firstHalfLimit = Math.ceil(sampleLimit / 2);
      const secondHalfLimit = sampleLimit - firstHalfLimit;
      const baseFilter: FilterQuery<Post> = {
        ...candidateFilter,
        deletedAt: null,
        hotEligible: true,
        hotLastActiveAt: { $gte: new Date(Date.now() - HOT_POST_WINDOW_MS) },
      };
      const [afterBoundary, beforeBoundary] = await Promise.all([
        this.postModel
          .find({ ...baseFilter, _id: { $gte: boundary } })
          .sort({ _id: 1 })
          .limit(firstHalfLimit)
          .select('_id')
          .lean<Array<{ _id: Types.ObjectId }>>(),
        secondHalfLimit > 0
          ? this.postModel
              .find({ ...baseFilter, _id: { $lt: boundary } })
              .sort({ _id: 1 })
              .limit(secondHalfLimit)
              .select('_id')
              .lean<Array<{ _id: Types.ObjectId }>>()
          : Promise.resolve([]),
      ]);
      return shuffleCandidateIds(
        [...afterBoundary, ...beforeBoundary].map((post) => post._id.toString()),
      );
    }
    const requestedCircleIds = circleId
      ? [circleId]
      : [...new Set((circleIds ?? []).filter((id) => id.length > 0))];
    if (requestedCircleIds.length === 0) {
      const ids = await this.redisService
        .getClient()
        .srandmember(getGlobalCandidateKey(generation), count);
      return [...new Set(ids)].filter((id) => id !== HOT_CANDIDATE_READY_MEMBER);
    }

    const perCircleCount = Math.max(
      1,
      Math.ceil(count / requestedCircleIds.length) * HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER,
    );
    const candidatePages = await Promise.all(
      requestedCircleIds.map((requestedCircleId) =>
        this.redisService
          .getClient()
          .srandmember(getCircleCandidateKey(generation, requestedCircleId), perCircleCount),
      ),
    );
    return interleaveCandidateIds(candidatePages).slice(0, count);
  }

  private async updateCandidates(
    postId: string,
    circleId: string,
    eligible: boolean,
  ): Promise<void> {
    const redis = this.redisService.getClient();
    const generation = await this.getCandidateGeneration();
    const rebuildingGeneration = getRebuildingGeneration(
      await redis.get(HOT_CANDIDATE_REBUILD_LOCK_KEY),
    );
    const generations = [
      ...new Set([generation, ...(rebuildingGeneration ? [rebuildingGeneration] : [])]),
    ];
    await Promise.all(
      generations.flatMap((candidateGeneration) => {
        const globalKey = getGlobalCandidateKey(candidateGeneration);
        const circleKey = getCircleCandidateKey(candidateGeneration, circleId);
        return eligible
          ? [redis.sadd(globalKey, postId), redis.sadd(circleKey, postId)]
          : [redis.srem(globalKey, postId), redis.srem(circleKey, postId)];
      }),
    );
  }

  private async getCandidateGenerations(): Promise<string[]> {
    const redis = this.redisService.getClient();
    const generation = await this.getCandidateGeneration();
    const rebuildingGeneration = getRebuildingGeneration(
      await redis.get(HOT_CANDIDATE_REBUILD_LOCK_KEY),
    );
    return [...new Set([generation, ...(rebuildingGeneration ? [rebuildingGeneration] : [])])];
  }

  private async removeCandidateIds(
    postIds: string[],
    circleId?: string,
    removeGlobal = true,
  ): Promise<void> {
    const uniqueIds = [...new Set(postIds)].filter((postId) => postId.length > 0);
    if (uniqueIds.length === 0) return;
    const redis = this.redisService.getClient();
    const generations = await this.getCandidateGenerations();
    const operations: Promise<number>[] = [];
    for (const generation of generations) {
      if (removeGlobal) {
        operations.push(redis.srem(getGlobalCandidateKey(generation), ...uniqueIds));
      }
      if (circleId) {
        operations.push(redis.srem(getCircleCandidateKey(generation, circleId), ...uniqueIds));
      }
    }
    await Promise.all(operations);
  }

  private async removePostFromCandidates(postId: string, circleId?: string): Promise<void> {
    await this.removeCandidateIds(postId ? [postId] : [], circleId);
  }
}

@Processor(HOT_RANKING_QUEUE, { concurrency: HOT_WORKER_CONCURRENCY })
export class HotRankingProcessor extends WorkerHost {
  constructor(private readonly rankingService: HotRankingService) {
    super();
  }

  async process(job: Job<HotRankingJob>): Promise<void> {
    if (job.data.kind === HOT_RANKING_JOB_KINDS.REFRESH) {
      await this.rankingService.refreshRecentCandidates();
      return;
    }
    if (job.data.kind === HOT_RANKING_JOB_KINDS.DISPATCH) {
      await this.rankingService.dispatchDirtyPosts();
      return;
    }
    if (
      job.data.kind !== HOT_RANKING_JOB_KINDS.RECOMPUTE ||
      typeof job.data.postId !== 'string' ||
      typeof job.data.signalVersion !== 'number'
    ) {
      throw new Error('热度队列任务结构无效');
    }
    await this.rankingService.recomputePost(job.data.postId, job.data.signalVersion);
  }
}
