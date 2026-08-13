import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { CircleMembership } from '@/database/schemas/circle-membership.schema';
import { PostHotState } from '@/database/schemas/post-hot-state.schema';
import { Post, type PostDocument } from '@/database/schemas/post.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { CIRCLE_STATUSES } from '@/circle/circle.constants';
import {
  HOT_CANDIDATE_OVERSAMPLE_MULTIPLIER,
  HOT_PAGE_SCAN_SIZE,
  HOT_POST_MAX_PAGE_SIZE,
  MAX_CIRCLE_HOT_POSTS,
} from '@/hot-ranking/hot-ranking.constants';
import {
  candidatePostId,
  circleCandidateKey,
  globalCandidateKey,
  readReadyCandidateGenerationId,
} from '@/hot-ranking/hot-candidate-keys';
import type { HotPostPage, HotPostQueryOptions } from '@/hot-ranking/hot-ranking.types';
import { decodeHotCursor, encodeHotCursor } from '@/common/pagination/pagination-cursor';
import { RedisService } from '@/redis/redis.service';

interface CandidateReadState {
  postId: string;
  circleId: string;
}

interface CandidatePostReference {
  _id: Types.ObjectId;
  circleId: string;
}

interface ScannedCandidate {
  member: string;
  wrapped: boolean;
}

interface CandidateScanResult {
  candidates: ScannedCandidate[];
  exhausted: boolean;
}

function toObjectIds(ids: string[]): Types.ObjectId[] {
  return ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
}

@Injectable()
export class HotRankingQueryService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PostHotState.name) private readonly stateModel: Model<PostHotState>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleMembership.name)
    private readonly circleMembershipModel: Model<CircleMembership>,
    private readonly redisService: RedisService,
  ) {}

  async listRandomHotPosts(
    where: FilterQuery<Post>,
    options: HotPostQueryOptions,
  ): Promise<HotPostPage> {
    const limit = Math.min(HOT_POST_MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.limit)));
    const generationId = await this.findReadyGeneration();
    if (!generationId) return { posts: [], nextCursor: null };
    const key = options.circleId
      ? circleCandidateKey(generationId, options.circleId)
      : globalCandidateKey(generationId);
    const initialPosition = options.cursor
      ? decodeHotCursor(options.cursor, {
          context: options.cursorContext,
          subjectId: options.cursorSubjectId,
        })
      : await this.createInitialPosition(key);
    if (!initialPosition) return { posts: [], nextCursor: null };

    const scan = await this.scanCandidateMembers(key, initialPosition);
    if (scan.candidates.length === 0) return { posts: [], nextCursor: null };
    const candidateIds = scan.candidates.map((candidate) => candidatePostId(candidate.member));
    const [validIds, rows] = await Promise.all([
      this.filterEligibleCandidateIds(candidateIds, options.circleId),
      this.postModel
        .find({
          ...where,
          ...(options.candidateFilter ?? {}),
          _id: { $in: toObjectIds(candidateIds) },
          deletedAt: null,
        })
        .select('_id circleId')
        .lean<CandidatePostReference[]>(),
    ]);
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
    const memberCircleIds = options.membershipAgentId
      ? new Set(
          (
            await this.circleMembershipModel
              .find({
                agentId: options.membershipAgentId,
                circleId: { $in: [...new Set(rows.map((row) => row.circleId))] },
              })
              .select('circleId')
              .lean<Array<Pick<CircleMembership, 'circleId'>>>()
          ).map((membership) => membership.circleId),
        )
      : null;
    const validIdSet = new Set(validIds);
    const rowById = new Map(
      rows
        .filter(
          (row) =>
            validIdSet.has(row._id.toString()) &&
            activeCircleIds.has(row.circleId) &&
            (memberCircleIds === null || memberCircleIds.has(row.circleId)),
        )
        .map((row) => [row._id.toString(), row]),
    );

    const selectedPostIds: string[] = [];
    let lastConsumed: ScannedCandidate | null = null;
    let consumedCount = 0;
    for (const candidate of scan.candidates) {
      consumedCount += 1;
      lastConsumed = candidate;
      const postId = candidatePostId(candidate.member);
      if (rowById.has(postId)) selectedPostIds.push(postId);
      if (selectedPostIds.length >= limit) break;
    }
    const traversalExhausted = scan.exhausted && consumedCount === scan.candidates.length;
    const selectedPosts =
      selectedPostIds.length === 0
        ? []
        : await this.postModel.find({
            _id: { $in: toObjectIds(selectedPostIds) },
            deletedAt: null,
          });
    const selectedPostById = new Map(selectedPosts.map((post) => [post.id, post]));
    const posts: PostDocument[] = selectedPostIds.flatMap((postId) => {
      const post = selectedPostById.get(postId);
      return post ? [post] : [];
    });
    return {
      posts,
      nextCursor:
        traversalExhausted || !lastConsumed
          ? null
          : encodeHotCursor(
              {
                start: initialPosition.start,
                current: lastConsumed.member,
                wrapped: lastConsumed.wrapped,
              },
              {
                context: options.cursorContext,
                subjectId: options.cursorSubjectId,
              },
            ),
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

  async getHotPostIds(postIds: string[], session?: ClientSession): Promise<Set<string>> {
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
      .session(session ?? null)
      .lean<Array<{ postId: string }>>();
    return new Set(states.map((state) => state.postId));
  }

  private async createInitialPosition(
    key: string,
  ): Promise<{ start: string; current: null; wrapped: false } | null> {
    const count = await this.redisService.getClient().zcard(key);
    if (count === 0) return null;
    const startRank = randomInt(count);
    const [start] = await this.redisService.getClient().zrange(key, startRank, startRank);
    if (!start) throw new Error('热帖候选索引随机起点读取失败');
    return { start, current: null, wrapped: false };
  }

  private async scanCandidateMembers(
    key: string,
    initial: { start: string; current: string | null; wrapped: boolean },
  ): Promise<CandidateScanResult> {
    const candidates: ScannedCandidate[] = [];
    let current = initial.current;
    let wrapped = initial.wrapped;
    let exhausted = false;
    while (candidates.length < HOT_PAGE_SCAN_SIZE) {
      const remaining = HOT_PAGE_SCAN_SIZE - candidates.length;
      const minimum = current ? `(${current}` : wrapped ? '-' : `[${initial.start}`;
      const maximum = wrapped ? `(${initial.start}` : '+';
      const rows = await this.redisService
        .getClient()
        .zrangebylex(key, minimum, maximum, 'LIMIT', 0, remaining + 1);
      const selected = rows.slice(0, remaining);
      candidates.push(...selected.map((member) => ({ member, wrapped })));
      if (rows.length > remaining) break;
      if (wrapped) {
        exhausted = true;
        break;
      }
      wrapped = true;
      current = null;
    }
    return { candidates, exhausted };
  }

  private async filterEligibleCandidateIds(ids: string[], circleId?: string): Promise<string[]> {
    const uniqueIds = [...new Set(ids.filter((id) => Types.ObjectId.isValid(id)))];
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

  private async sampleCircleCandidateIds(
    generationId: string,
    circleIds: string[],
    count: number,
  ): Promise<Map<string, string[]>> {
    const pipeline = this.redisService.getClient().pipeline();
    for (const circleId of circleIds) {
      pipeline.zrandmember(circleCandidateKey(generationId, circleId), count);
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
      result.set(circleIds[index], [
        ...new Set(value.map(candidatePostId).filter((id) => Types.ObjectId.isValid(id))),
      ]);
    }
    return result;
  }

  private async findReadyGeneration(): Promise<string | null> {
    return readReadyCandidateGenerationId(this.redisService.getClient());
  }
}
