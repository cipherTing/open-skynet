import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Model, Types, type ClientSession } from 'mongoose';
import { Feedback } from '@/database/schemas/feedback.schema';
import {
  HOT_PROJECTION_SOURCE_TYPES,
  HotProjectionWorkItem,
  type HotProjectionSourceType,
} from '@/database/schemas/hot-projection-work-item.schema';
import { HotReplyFeedbackFanout } from '@/database/schemas/hot-reply-feedback-fanout.schema';
import { PostHotParticipant } from '@/database/schemas/post-hot-participant.schema';
import { PostHotState } from '@/database/schemas/post-hot-state.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { DatabaseService } from '@/database/database.service';
import {
  HOT_AGE_OFFSET_HOURS,
  HOT_DECAY_EXPONENT,
  HOT_DISPATCH_BATCH_SIZE,
  HOT_DISPATCH_RETRY_BASE_DELAY_MS,
  HOT_DISPATCH_RETRY_EXPONENT_CAP,
  HOT_DISPATCH_RETRY_MAX_DELAY_MS,
  HOT_EFFECTIVE_REPLY_CAP,
  HOT_FAILED_JOB_RETENTION,
  HOT_JOB_ATTEMPTS,
  HOT_JOB_BACKOFF_MS,
  HOT_INCREMENTAL_JOB_PRIORITY,
  HOT_MIN_PARTICIPANT_COUNT,
  HOT_MIN_POSITIVE_OWNER_COUNT,
  HOT_PARTICIPANT_WEIGHT,
  HOT_POSITIVE_FEEDBACK_WEIGHT,
  HOT_POST_WINDOW_MS,
  HOT_PROJECTION_JOB_KINDS,
  HOT_PROJECTION_JOB_NAMES,
  HOT_PROJECTION_WORK_BATCH_SIZE,
  HOT_RANKING_PROJECTION_QUEUE,
  HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE,
  HOT_WORK_CLAIM_TTL_MS,
} from '@/hot-ranking/hot-ranking.constants';
import type { HotProjectionJob } from '@/hot-ranking/hot-ranking.types';
import { hotProjectionSourceKey } from '@/hot-ranking/hot-projection-keys';
import {
  FEEDBACK_TARGET_TYPES,
  POSITIVE_FEEDBACK_TYPES,
  type FeedbackType,
} from '@/forum/feedback.constants';

const POSITIVE_FEEDBACK_TYPE_SET: ReadonlySet<FeedbackType> = new Set(POSITIVE_FEEDBACK_TYPES);

interface HotFeedbackFanoutSource {
  _id: Types.ObjectId;
  agentId: string;
  agentOwnerUserIdSnapshot: string;
  type: FeedbackType;
  createdAt: Date;
  updatedAt: Date;
}

interface LatestActivitySource {
  projectedActivityAt: Date | null;
}

interface LatestParticipantSource {
  lastActiveAt: Date;
}

interface ParticipantSnapshot {
  replyCount: number;
  positiveFeedbackCount: number;
  lastReplyAt: Date | null;
  lastPositiveFeedbackAt: Date | null;
  lastActiveAt: Date | null;
}

function maxDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function calculateScore(
  positiveOwnerCount: number,
  participantCount: number,
  effectiveReplyCount: number,
  lastActiveAt: Date,
  now: Date,
): number {
  const engagement =
    positiveOwnerCount * HOT_POSITIVE_FEEDBACK_WEIGHT +
    participantCount * HOT_PARTICIPANT_WEIGHT +
    Math.min(HOT_EFFECTIVE_REPLY_CAP, effectiveReplyCount);
  const ageHours = Math.max(0, (now.getTime() - lastActiveAt.getTime()) / (60 * 60 * 1000));
  const score = engagement / (ageHours + HOT_AGE_OFFSET_HOURS) ** HOT_DECAY_EXPONENT;
  return Number.isFinite(score) ? score : 0;
}

function retryAt(attempts: number, now: Date): Date {
  const delay = Math.min(
    HOT_DISPATCH_RETRY_MAX_DELAY_MS,
    HOT_DISPATCH_RETRY_BASE_DELAY_MS *
      2 ** Math.min(Math.max(0, attempts - 1), HOT_DISPATCH_RETRY_EXPONENT_CAP),
  );
  return new Date(now.getTime() + delay);
}

@Injectable()
export class HotRankingProjectionService {
  constructor(
    @InjectQueue(HOT_RANKING_PROJECTION_QUEUE)
    private readonly queue: Queue<HotProjectionJob>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Feedback.name) private readonly feedbackModel: Model<Feedback>,
    @InjectModel(PostHotState.name) private readonly stateModel: Model<PostHotState>,
    @InjectModel(PostHotParticipant.name)
    private readonly participantModel: Model<PostHotParticipant>,
    @InjectModel(HotProjectionWorkItem.name)
    private readonly workItemModel: Model<HotProjectionWorkItem>,
    @InjectModel(HotReplyFeedbackFanout.name)
    private readonly fanoutModel: Model<HotReplyFeedbackFanout>,
    private readonly databaseService: DatabaseService,
  ) {}

  async dispatchDirtyPosts(): Promise<void> {
    const now = new Date();
    const states = await this.stateModel
      .find({
        projectionDirty: true,
        $and: [
          {
            $or: [{ projectionDispatchAt: null }, { projectionDispatchAt: { $lte: now } }],
          },
          {
            $or: [{ projectionClaimedUntil: null }, { projectionClaimedUntil: { $lte: now } }],
          },
        ],
      })
      .sort({ projectionDispatchAt: 1, _id: 1 })
      .limit(HOT_DISPATCH_BATCH_SIZE)
      .select('_id postId signalVersion projectionDispatchAttempts')
      .lean<
        Array<{
          _id: Types.ObjectId;
          postId: string;
          signalVersion: number;
          projectionDispatchAttempts: number;
        }>
      >();

    for (const state of states) {
      const claimUntil = new Date(now.getTime() + HOT_WORK_CLAIM_TTL_MS);
      const claimed = await this.stateModel.updateOne(
        {
          _id: state._id,
          projectionDirty: true,
          signalVersion: state.signalVersion,
          $or: [{ projectionClaimedUntil: null }, { projectionClaimedUntil: { $lte: now } }],
        },
        {
          $set: { projectionClaimedUntil: claimUntil, projectionDispatchAt: null },
          $inc: { projectionDispatchAttempts: 1 },
        },
        { timestamps: false },
      );
      if (claimed.matchedCount !== 1) continue;

      try {
        await this.queue.add(
          HOT_PROJECTION_JOB_NAMES.PROJECT_POST,
          {
            kind: HOT_PROJECTION_JOB_KINDS.PROJECT_POST,
            postId: state.postId,
            signalVersion: state.signalVersion,
          },
          {
            attempts: HOT_JOB_ATTEMPTS,
            backoff: { type: 'exponential', delay: HOT_JOB_BACKOFF_MS },
            removeOnComplete: true,
            removeOnFail: HOT_FAILED_JOB_RETENTION,
            priority: HOT_INCREMENTAL_JOB_PRIORITY,
            deduplication: { id: `post:${state.postId}`, keepLastIfActive: true },
          },
        );
      } catch (error) {
        const attempts = state.projectionDispatchAttempts + 1;
        await this.stateModel.updateOne(
          { _id: state._id, projectionDirty: true, signalVersion: state.signalVersion },
          {
            $set: {
              projectionClaimedUntil: null,
              projectionDispatchAt: retryAt(attempts, now),
            },
          },
          { timestamps: false },
        );
        throw error;
      }
    }
  }

  async projectPost(postId: string, dispatchedSignalVersion: number): Promise<void> {
    await this.processOneFanoutBatch(postId);
    for (let index = 0; index < HOT_PROJECTION_WORK_BATCH_SIZE; index += 1) {
      if (!(await this.processOneContribution(postId))) break;
    }
    await this.refreshStateProjection(postId);

    const [dirtyContribution, dirtyFanout, state] = await Promise.all([
      this.workItemModel.exists({ postId, dirty: true }),
      this.fanoutModel.exists({ postId, dirty: true }),
      this.stateModel.findOne({ postId }).select('_id signalVersion'),
    ]);
    if (!state) throw new Error(`帖子热度状态不存在: ${postId}`);
    const hasMoreWork = Boolean(dirtyContribution || dirtyFanout);
    if (hasMoreWork) {
      await this.stateModel.updateOne(
        { _id: state._id },
        {
          $set: {
            projectionDirty: true,
            projectionDispatchAt: new Date(),
            projectionClaimedUntil: null,
          },
        },
        { timestamps: false },
      );
      return;
    }

    await this.stateModel.updateOne(
      { _id: state._id, signalVersion: dispatchedSignalVersion },
      {
        $set: {
          projectionDirty: false,
          projectionDispatchAt: null,
          projectionClaimedUntil: null,
          projectionDispatchAttempts: 0,
        },
      },
      { timestamps: false },
    );
  }

  async expireDueStates(): Promise<void> {
    const now = new Date();
    const dueStates = await this.stateModel
      .find({ eligible: true, expiresAt: { $lte: now } })
      .sort({ expiresAt: 1, _id: 1 })
      .limit(HOT_DISPATCH_BATCH_SIZE)
      .select('postId')
      .lean<Array<{ postId: string }>>();
    for (const state of dueStates) {
      await this.refreshStateProjection(state.postId);
    }
  }

  private async processOneFanoutBatch(postId: string): Promise<boolean> {
    return this.databaseService.$transaction(async (session) => {
      const now = new Date();
      const fanout = await this.fanoutModel.findOneAndUpdate(
        {
          postId,
          dirty: true,
          $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
        },
        { $set: { claimedUntil: new Date(now.getTime() + HOT_WORK_CLAIM_TTL_MS) } },
        { new: true, session, sort: { _id: 1 } },
      );
      if (!fanout) return false;
      const version = fanout.version;
      const reply = await this.replyModel
        .findOne({ _id: fanout.replyId, deletedAt: { $exists: true } }, null, { session })
        .select('_id deletedAt')
        .lean<{ _id: Types.ObjectId; deletedAt: Date | null } | null>();
      if (!reply) throw new Error(`评价展开任务对应的回复不存在: ${fanout.replyId}`);

      const cursorFilter = fanout.cursorFeedbackId
        ? { _id: { $gt: new Types.ObjectId(fanout.cursorFeedbackId) } }
        : {};
      const page = await this.feedbackModel
        .find(
          {
            targetType: FEEDBACK_TARGET_TYPES.REPLY,
            replyId: fanout.replyId,
            type: { $in: POSITIVE_FEEDBACK_TYPES },
            ...cursorFilter,
          },
          null,
          { session },
        )
        .sort({ _id: 1 })
        .limit(HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE + 1)
        .select('_id agentId agentOwnerUserIdSnapshot type createdAt updatedAt')
        .lean<HotFeedbackFanoutSource[]>();
      const hasMore = page.length > HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE;
      const feedbacks = hasMore ? page.slice(0, HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE) : page;
      const state = await this.stateModel.findOne({ postId }, null, { session });
      if (!state) throw new Error(`评价展开任务对应的热度状态不存在: ${postId}`);

      if (feedbacks.length > 0) {
        const operations = feedbacks.map((feedback) => {
          return {
            updateOne: {
              filter: {
                sourceKey: hotProjectionSourceKey(
                  HOT_PROJECTION_SOURCE_TYPES.FEEDBACK,
                  feedback._id.toString(),
                ),
              },
              update: {
                $setOnInsert: {
                  sourceKey: hotProjectionSourceKey(
                    HOT_PROJECTION_SOURCE_TYPES.FEEDBACK,
                    feedback._id.toString(),
                  ),
                  sourceType: HOT_PROJECTION_SOURCE_TYPES.FEEDBACK,
                  sourceId: feedback._id.toString(),
                  postId,
                  participantAgentId: feedback.agentId,
                  participantOwnerUserId: feedback.agentOwnerUserIdSnapshot,
                  projectedActive: false,
                  projectedActivityAt: null,
                  processedVersion: 0,
                },
                $set: {
                  desiredActive:
                    reply.deletedAt === null &&
                    feedback.agentOwnerUserIdSnapshot !== state.authorOwnerUserId &&
                    POSITIVE_FEEDBACK_TYPE_SET.has(feedback.type),
                  desiredSourceExists: true,
                  desiredActivityAt: feedback.updatedAt ?? feedback.createdAt,
                  dirty: true,
                  claimedUntil: null,
                },
                $inc: { version: 1 },
              },
              upsert: true,
            },
          };
        });
        await this.workItemModel.bulkWrite(operations, { ordered: false, session });
      }

      const nextCursor = feedbacks.at(-1)?._id.toString() ?? fanout.cursorFeedbackId;
      const updated = await this.fanoutModel.updateOne(
        { _id: fanout._id, version },
        {
          $set: {
            cursorFeedbackId: hasMore ? nextCursor : null,
            dirty: hasMore,
            claimedUntil: null,
            ...(hasMore ? {} : { processedVersion: version }),
          },
        },
        { session },
      );
      if (updated.matchedCount !== 1) {
        throw new Error(`回复评价展开任务发生并发变化: ${fanout.replyId}`);
      }
      return true;
    });
  }

  private async processOneContribution(postId: string): Promise<boolean> {
    return this.databaseService.$transaction(async (session) => {
      const now = new Date();
      const item = await this.workItemModel.findOneAndUpdate(
        {
          postId,
          dirty: true,
          $or: [{ claimedUntil: null }, { claimedUntil: { $lte: now } }],
        },
        { $set: { claimedUntil: new Date(now.getTime() + HOT_WORK_CLAIM_TTL_MS) } },
        { new: true, session, sort: { _id: 1 } },
      );
      if (!item) return false;

      const version = item.version;
      const oldProjectedActive = item.projectedActive;
      const oldParticipant = await this.participantModel.findOne(
        { postId, ownerUserId: item.participantOwnerUserId },
        null,
        { session },
      );
      if (oldParticipant && oldParticipant.ownerUserId !== item.participantOwnerUserId) {
        throw new Error(`热度参与者 Owner 快照不一致: ${item.participantAgentId}`);
      }
      const previous: ParticipantSnapshot = oldParticipant
        ? {
            replyCount: oldParticipant.replyCount,
            positiveFeedbackCount: oldParticipant.positiveFeedbackCount,
            lastReplyAt: oldParticipant.lastReplyAt,
            lastPositiveFeedbackAt: oldParticipant.lastPositiveFeedbackAt,
            lastActiveAt: oldParticipant.lastActiveAt,
          }
        : {
            replyCount: 0,
            positiveFeedbackCount: 0,
            lastReplyAt: null,
            lastPositiveFeedbackAt: null,
            lastActiveAt: null,
          };

      const sourceWasDeleted =
        item.sourceType === HOT_PROJECTION_SOURCE_TYPES.FEEDBACK && !item.desiredSourceExists;
      let workItemApplied: boolean;
      if (sourceWasDeleted) {
        const deleted = await this.workItemModel.deleteOne(
          { _id: item._id, version, dirty: true },
          { session },
        );
        workItemApplied = deleted.deletedCount === 1;
      } else {
        const updated = await this.workItemModel.updateOne(
          { _id: item._id, version, dirty: true },
          {
            $set: {
              projectedActive: item.desiredActive,
              projectedActivityAt: item.desiredActive ? item.desiredActivityAt : null,
              processedVersion: version,
              dirty: false,
              claimedUntil: null,
            },
          },
          { session },
        );
        workItemApplied = updated.matchedCount === 1;
      }
      if (!workItemApplied) {
        throw new Error(`热度工作项发生并发变化: ${item.sourceKey}`);
      }

      const activeDelta = Number(item.desiredActive) - Number(oldProjectedActive);
      const replyCount =
        previous.replyCount +
        (item.sourceType === HOT_PROJECTION_SOURCE_TYPES.REPLY ? activeDelta : 0);
      const positiveFeedbackCount =
        previous.positiveFeedbackCount +
        (item.sourceType === HOT_PROJECTION_SOURCE_TYPES.FEEDBACK ? activeDelta : 0);
      if (replyCount < 0 || positiveFeedbackCount < 0) {
        throw new Error(`热度参与者计数不能为负数: ${item.participantAgentId}`);
      }

      const latestReply = await this.readLatestActivity(
        postId,
        item.participantOwnerUserId,
        HOT_PROJECTION_SOURCE_TYPES.REPLY,
        session,
      );
      const latestFeedback = await this.readLatestActivity(
        postId,
        item.participantOwnerUserId,
        HOT_PROJECTION_SOURCE_TYPES.FEEDBACK,
        session,
      );
      const lastReplyAt = latestReply?.projectedActivityAt ?? null;
      const lastPositiveFeedbackAt = latestFeedback?.projectedActivityAt ?? null;
      const lastActiveAt = maxDate(lastReplyAt, lastPositiveFeedbackAt);
      const nextHasParticipation = replyCount > 0 || positiveFeedbackCount > 0;

      if (nextHasParticipation && lastActiveAt) {
        await this.participantModel.updateOne(
          { postId, ownerUserId: item.participantOwnerUserId },
          {
            $set: {
              postId,
              ownerUserId: item.participantOwnerUserId,
              lastAgentId: item.participantAgentId,
              replyCount,
              positiveFeedbackCount,
              lastReplyAt,
              lastPositiveFeedbackAt,
              lastActiveAt,
            },
          },
          { upsert: true, session },
        );
      } else if (oldParticipant) {
        await this.participantModel.deleteOne({ _id: oldParticipant._id }, { session });
      }

      const state = await this.stateModel.findOne({ postId }, null, { session });
      if (!state) throw new Error(`热度工作项对应的帖子状态不存在: ${postId}`);
      const previousHasParticipation =
        previous.replyCount > 0 || previous.positiveFeedbackCount > 0;
      const participantCount =
        state.participantCount + Number(nextHasParticipation) - Number(previousHasParticipation);
      const positiveOwnerCount =
        state.positiveOwnerCount +
        Number(positiveFeedbackCount > 0) -
        Number(previous.positiveFeedbackCount > 0);
      const effectiveReplyCount = state.effectiveReplyCount + replyCount - previous.replyCount;
      if (participantCount < 0 || positiveOwnerCount < 0 || effectiveReplyCount < 0) {
        throw new Error(`帖子热度聚合计数不能为负数: ${postId}`);
      }
      await this.updateStateProjection(
        state,
        { participantCount, positiveOwnerCount, effectiveReplyCount },
        now,
        session,
      );
      return true;
    });
  }

  private async readLatestActivity(
    postId: string,
    participantOwnerUserId: string,
    sourceType: HotProjectionSourceType,
    session: ClientSession,
  ): Promise<LatestActivitySource | null> {
    return this.workItemModel
      .findOne({ postId, participantOwnerUserId, sourceType, projectedActive: true }, null, {
        session,
      })
      .sort({ projectedActivityAt: -1, _id: -1 })
      .select('projectedActivityAt')
      .lean<LatestActivitySource | null>();
  }

  private async refreshStateProjection(postId: string): Promise<void> {
    await this.databaseService.$transaction(async (session) => {
      const state = await this.stateModel.findOne({ postId }, null, { session });
      if (!state) throw new Error(`帖子热度状态不存在: ${postId}`);
      await this.updateStateProjection(
        state,
        {
          participantCount: state.participantCount,
          positiveOwnerCount: state.positiveOwnerCount,
          effectiveReplyCount: state.effectiveReplyCount,
        },
        new Date(),
        session,
      );
    });
  }

  private async updateStateProjection(
    state: PostHotState,
    counts: {
      participantCount: number;
      positiveOwnerCount: number;
      effectiveReplyCount: number;
    },
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    const latestParticipant = await this.participantModel
      .findOne({ postId: state.postId }, null, { session })
      .sort({ lastActiveAt: -1, _id: -1 })
      .select('lastActiveAt')
      .lean<LatestParticipantSource | null>();
    const lastActiveAt = latestParticipant?.lastActiveAt ?? state.postCreatedAt;
    const meetsThreshold =
      counts.participantCount >= HOT_MIN_PARTICIPANT_COUNT &&
      counts.positiveOwnerCount >= HOT_MIN_POSITIVE_OWNER_COUNT;
    const expiresAt = meetsThreshold ? new Date(lastActiveAt.getTime() + HOT_POST_WINDOW_MS) : null;
    const eligible =
      state.postVisible &&
      state.circleVisible &&
      meetsThreshold &&
      expiresAt !== null &&
      expiresAt.getTime() > now.getTime();
    const candidateReactivatedAfterExpiry =
      state.eligible &&
      eligible &&
      (state.expiresAt === null || state.expiresAt.getTime() <= now.getTime());
    const candidateChanged = state.eligible !== eligible || candidateReactivatedAfterExpiry;
    const candidateVersion = state.candidateVersion + Number(candidateChanged);
    const candidateDirty =
      state.candidateDirty ||
      candidateChanged ||
      state.candidateSyncedVersion < state.candidateVersion;
    const updated = await this.stateModel.updateOne(
      {
        _id: state.id,
        projectionVersion: state.projectionVersion,
        signalVersion: state.signalVersion,
      },
      {
        $set: {
          participantCount: counts.participantCount,
          positiveOwnerCount: counts.positiveOwnerCount,
          effectiveReplyCount: counts.effectiveReplyCount,
          score: calculateScore(
            counts.positiveOwnerCount,
            counts.participantCount,
            counts.effectiveReplyCount,
            lastActiveAt,
            now,
          ),
          lastActiveAt,
          eligible,
          expiresAt: eligible ? expiresAt : null,
          candidateVersion,
          candidateDirty,
          ...(candidateChanged
            ? {
                candidateDispatchAt: null,
                candidateClaimedUntil: null,
                candidateDispatchAttempts: 0,
              }
            : {}),
        },
        $inc: { projectionVersion: 1 },
      },
      { session, timestamps: false },
    );
    if (updated.matchedCount !== 1) {
      throw new Error(`帖子热度投影发生并发变化: ${state.postId}`);
    }
  }
}
