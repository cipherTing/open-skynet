import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type FilterQuery } from 'mongoose';
import { forumErrors } from '@/common/errors/business-errors';
import {
  HOT_CANDIDATE_GENERATION_STATUSES,
  HotCandidateGeneration,
} from '@/database/schemas/hot-candidate-generation.schema';
import { PostHotState } from '@/database/schemas/post-hot-state.schema';
import { Post, type PostDocument } from '@/database/schemas/post.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { CIRCLE_STATUSES } from '@/circle/circle.constants';
import {
  HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER,
  HOT_PAGE_SCAN_SIZE,
  HOT_POST_MAX_PAGE_SIZE,
  HOT_SNAPSHOT_KEY_PREFIX,
  HOT_SNAPSHOT_SAMPLE_SIZE,
  HOT_SNAPSHOT_TTL_SECONDS,
  MAX_CIRCLE_HOT_POSTS,
} from '@/hot-ranking/hot-ranking.constants';
import {
  circleCandidateKey,
  globalCandidateKey,
  readReadyCandidateGenerationId,
} from '@/hot-ranking/hot-candidate-keys';
import type { HotPostPage, HotPostQueryOptions } from '@/hot-ranking/hot-ranking.types';
import { REDIS_SET_EXPIRATION_UNITS } from '@/redis/redis.constants';
import { RedisService } from '@/redis/redis.service';

interface HotSnapshot {
  filterHash: string;
  ids: string[];
}

interface HotSnapshotCursor {
  snapshotId: string;
  offset: number;
  filterHash: string;
}

interface CandidateReadState {
  postId: string;
  circleId: string;
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
    parsed.ids.length > HOT_SNAPSHOT_SAMPLE_SIZE ||
    !parsed.ids.every((id) => typeof id === 'string' && Types.ObjectId.isValid(id)) ||
    new Set(parsed.ids).size !== parsed.ids.length
  ) {
    return null;
  }
  return { filterHash: parsed.filterHash, ids: parsed.ids };
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
    offset: parsed.offset,
    filterHash: parsed.filterHash,
  };
}

function hashFilterKey(filterKey: string): string {
  return createHash('sha256').update(filterKey).digest('hex');
}

function toObjectIds(ids: string[]): Types.ObjectId[] {
  return ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
}

function interleaveCandidateIds(candidatePages: string[][]): string[] {
  const uniqueIds = new Set<string>();
  const maxPageLength = Math.max(0, ...candidatePages.map((page) => page.length));
  for (let index = 0; index < maxPageLength; index += 1) {
    for (const page of candidatePages) {
      const id = page[index];
      if (id) uniqueIds.add(id);
    }
  }
  return [...uniqueIds];
}

@Injectable()
export class HotRankingQueryService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PostHotState.name) private readonly stateModel: Model<PostHotState>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(HotCandidateGeneration.name)
    private readonly generationModel: Model<HotCandidateGeneration>,
    private readonly redisService: RedisService,
  ) {}

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
      if (!decoded || decoded.filterHash !== filterHash) throw forumErrors.hotCursorInvalid();
      const snapshotRaw = await this.redisService
        .getClient()
        .get(`${HOT_SNAPSHOT_KEY_PREFIX}${decoded.snapshotId}`);
      if (!snapshotRaw) throw forumErrors.hotCursorExpired();
      const snapshot = parseHotSnapshot(snapshotRaw);
      if (!snapshot || snapshot.filterHash !== filterHash || decoded.offset > snapshot.ids.length) {
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
      );
      await this.writeSnapshot(snapshotId, { filterHash, ids });
      offset = 0;
    }

    const posts: PostDocument[] = [];
    while (posts.length < limit && offset < ids.length) {
      const scanStart = offset;
      const scanIds = ids.slice(scanStart, scanStart + HOT_PAGE_SCAN_SIZE);
      const [validIds, rows] = await Promise.all([
        this.filterEligibleCandidateIds(scanIds, options.circleId),
        this.postModel.find({
          ...where,
          ...(options.candidateFilter ?? {}),
          _id: { $in: toObjectIds(scanIds) },
          deletedAt: null,
        }),
      ]);
      const validIdSet = new Set(validIds);
      const activeCircleIds = new Set(
        (
          await this.circleModel
            .find({
              _id: { $in: [...new Set(rows.map((row) => row.circleId))] },
              deletedAt: null,
              status: CIRCLE_STATUSES.ACTIVE,
            })
            .select('_id')
        ).map((circle) => circle.id),
      );
      const rowById = new Map(
        rows
          .filter((row) => validIdSet.has(row.id) && activeCircleIds.has(row.circleId))
          .map((row) => [row.id, row]),
      );
      let consumed = 0;
      for (const id of scanIds) {
        consumed += 1;
        const post = rowById.get(id);
        if (post) posts.push(post);
        if (posts.length >= limit) break;
      }
      offset = scanStart + consumed;
    }

    return {
      posts,
      nextCursor: offset < ids.length ? encodeCursor({ snapshotId, offset, filterHash }) : null,
    };
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
    const generationId = await this.findReadyGeneration();
    if (!generationId) return result;

    const pageSize = Math.min(MAX_CIRCLE_HOT_POSTS, Math.max(1, Math.trunc(limit)));
    const candidateIdsByCircle = await this.sampleCircleCandidateIds(
      generationId,
      uniqueCircleIds,
      pageSize * HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER,
    );
    const candidateIds = [...new Set([...candidateIdsByCircle.values()].flat())];
    if (candidateIds.length === 0) return result;
    const validIds = new Set(await this.filterEligibleCandidateIds(candidateIds));
    const posts = await this.postModel
      .find({ _id: { $in: toObjectIds([...validIds]) }, deletedAt: null })
      .select('_id circleId title createdAt');
    const postById = new Map(posts.map((post) => [post.id, post]));
    for (const circleId of uniqueCircleIds) {
      const rows = (candidateIdsByCircle.get(circleId) ?? []).flatMap((postId) => {
        const post = postById.get(postId);
        if (!post || post.circleId !== circleId) return [];
        return [{ id: post.id, title: post.title, createdAt: post.createdAt.toISOString() }];
      });
      result.set(circleId, rows.slice(0, pageSize));
    }
    return result;
  }

  async getHotPostIds(postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    const states = await this.stateModel
      .find({
        postId: { $in: [...new Set(postIds)] },
        postVisible: true,
        circleVisible: true,
        projectionDirty: false,
        eligible: true,
        expiresAt: { $gt: new Date() },
      })
      .select('postId')
      .lean<Array<{ postId: string }>>();
    return new Set(states.map((state) => state.postId));
  }

  private async filterEligibleCandidateIds(ids: string[], circleId?: string): Promise<string[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const states = await this.stateModel
      .find({
        postId: { $in: uniqueIds },
        postVisible: true,
        circleVisible: true,
        projectionDirty: false,
        eligible: true,
        expiresAt: { $gt: new Date() },
        ...(circleId ? { circleId } : {}),
      })
      .select('postId circleId')
      .lean<CandidateReadState[]>();
    const validIds = new Set(states.map((state) => state.postId));
    return uniqueIds.filter((id) => validIds.has(id));
  }

  private async sampleCandidateIds(
    circleId: string | undefined,
    count: number,
    circleIds: string[] | undefined,
  ): Promise<string[]> {
    const generationId = await this.findReadyGeneration();
    if (!generationId) return [];
    const requestedCircleIds = circleId
      ? [circleId]
      : [...new Set((circleIds ?? []).filter((id) => id.length > 0))];
    if (requestedCircleIds.length === 0) {
      return [
        ...new Set(
          await this.redisService.getClient().srandmember(globalCandidateKey(generationId), count),
        ),
      ];
    }
    const candidatesByCircle = await this.sampleCircleCandidateIds(
      generationId,
      requestedCircleIds,
      Math.max(
        1,
        Math.ceil(count / requestedCircleIds.length) * HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER,
      ),
    );
    return interleaveCandidateIds(
      requestedCircleIds.map((circleIdValue) => candidatesByCircle.get(circleIdValue) ?? []),
    ).slice(0, count);
  }

  private async sampleCircleCandidateIds(
    generationId: string,
    circleIds: string[],
    count: number,
  ): Promise<Map<string, string[]>> {
    const pipeline = this.redisService.getClient().pipeline();
    for (const circleId of circleIds) {
      pipeline.srandmember(circleCandidateKey(generationId, circleId), count);
    }
    const responses = await pipeline.exec();
    if (!responses || responses.length !== circleIds.length) {
      throw new Error('热帖圈子候选批量读取结果不完整');
    }
    const result = new Map<string, string[]>();
    for (const [index, response] of responses.entries()) {
      const [error, value] = response;
      if (error) throw error;
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw new Error(`热帖圈子候选返回类型无效: ${circleIds[index]}`);
      }
      result.set(circleIds[index], [...new Set(value)]);
    }
    return result;
  }

  private async writeSnapshot(snapshotId: string, snapshot: HotSnapshot): Promise<void> {
    await this.redisService
      .getClient()
      .set(
        `${HOT_SNAPSHOT_KEY_PREFIX}${snapshotId}`,
        JSON.stringify(snapshot),
        REDIS_SET_EXPIRATION_UNITS.SECONDS,
        HOT_SNAPSHOT_TTL_SECONDS,
      );
  }

  private async findReadyGeneration(): Promise<string | null> {
    const generationId = await readReadyCandidateGenerationId(this.redisService.getClient());
    if (generationId) return generationId;
    const activeGenerationExists = await this.generationModel.exists({
      status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
    });
    if (activeGenerationExists) {
      throw new Error('热帖候选索引状态不一致：活跃代际缺少 Redis 指针');
    }
    return null;
  }
}
