import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import {
  HOT_PROJECTION_SOURCE_TYPES,
  HotProjectionWorkItem,
  type HotProjectionSourceType,
} from '@/database/schemas/hot-projection-work-item.schema';
import { HotReplyBranchFanout } from '@/database/schemas/hot-reply-branch-fanout.schema';
import { HotReplyFeedbackFanout } from '@/database/schemas/hot-reply-feedback-fanout.schema';
import { PostHotState } from '@/database/schemas/post-hot-state.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import type { RecordFeedbackContributionInput } from '@/hot-ranking/hot-ranking.types';
import { hotProjectionSourceKey } from '@/hot-ranking/hot-projection-keys';
import {
  FEEDBACK_TARGET_TYPES,
  POSITIVE_FEEDBACK_TYPES,
  type FeedbackType,
} from '@/forum/feedback.constants';

const POSITIVE_FEEDBACK_TYPE_SET: ReadonlySet<FeedbackType> = new Set(POSITIVE_FEEDBACK_TYPES);

interface HotPostSource {
  _id: Types.ObjectId;
  authorId: string;
  circleId: string;
  circleVisible: boolean;
  circleVisibilityVersion: number;
  createdAt: Date;
  deletedAt: Date | null;
}

interface HotReplySource {
  _id: Types.ObjectId;
  postId: string;
  authorId: string;
  authorOwnerUserIdSnapshot: string;
  parentReplyId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

interface HotReplyVisibilitySource {
  _id: Types.ObjectId;
  postId: string;
  parentReplyId: string | null;
  deletedAt: Date | null;
}

interface HotRootReplyVisibilitySource {
  _id: Types.ObjectId;
  deletedAt: Date | null;
}

interface HotAgentOwnerSource {
  userId: string;
}

@Injectable()
export class HotRankingWorkService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(PostHotState.name) private readonly stateModel: Model<PostHotState>,
    @InjectModel(HotProjectionWorkItem.name)
    private readonly workItemModel: Model<HotProjectionWorkItem>,
    @InjectModel(HotReplyBranchFanout.name)
    private readonly branchFanoutModel: Model<HotReplyBranchFanout>,
    @InjectModel(HotReplyFeedbackFanout.name)
    private readonly fanoutModel: Model<HotReplyFeedbackFanout>,
  ) {}

  async initializePost(postId: string, session: ClientSession): Promise<void> {
    await this.ensureState(postId, session);
  }

  async recordPostVisibilityChanged(postId: string, session: ClientSession): Promise<void> {
    const state = await this.requireState(postId, session);
    const post = await this.readPost(postId, session);
    await this.stateModel.updateOne(
      { _id: state._id },
      {
        $set: {
          postVisible: post.deletedAt === null,
          projectionDirty: true,
          projectionDispatchAt: null,
          projectionClaimedUntil: null,
          projectionDispatchAttempts: 0,
        },
        $inc: { signalVersion: 1 },
      },
      { session, timestamps: false },
    );
  }

  async recordReplyCreated(replyId: string, session: ClientSession): Promise<void> {
    await this.recordReplyState(replyId, false, session);
  }

  async recordReplyVisibilityChanged(replyId: string, session: ClientSession): Promise<void> {
    await this.recordReplyState(replyId, true, session);
  }

  async recordFeedbackContribution(
    input: RecordFeedbackContributionInput,
    session: ClientSession,
  ): Promise<void> {
    const state = await this.requireState(input.postId, session);
    const targetVisible = await this.isFeedbackTargetVisible(input, session);
    const desiredActive =
      input.sourceExists &&
      targetVisible &&
      input.ownerUserIdSnapshot !== state.authorOwnerUserId &&
      input.feedbackType !== null &&
      POSITIVE_FEEDBACK_TYPE_SET.has(input.feedbackType);
    const changed = await this.upsertWorkItem(
      {
        sourceType: HOT_PROJECTION_SOURCE_TYPES.FEEDBACK,
        sourceId: input.feedbackId,
        postId: input.postId,
        participantAgentId: input.agentId,
        participantOwnerUserId: input.ownerUserIdSnapshot,
        desiredActive,
        desiredSourceExists: input.sourceExists,
        desiredActivityAt: input.activityAt,
      },
      session,
    );
    if (changed) await this.markStateProjectionDirty(state._id, session);
  }

  private async isFeedbackTargetVisible(
    input: RecordFeedbackContributionInput,
    session: ClientSession,
  ): Promise<boolean> {
    switch (input.target.type) {
      case FEEDBACK_TARGET_TYPES.POST: {
        if (input.target.id !== input.postId) {
          throw new Error(`评价目标帖子与上下文不一致: ${input.feedbackId}`);
        }
        const post = await this.postModel
          .findOne({ _id: input.target.id, deletedAt: null }, '_id', { session })
          .lean<{ _id: Types.ObjectId } | null>();
        return post !== null;
      }
      case FEEDBACK_TARGET_TYPES.REPLY: {
        const reply = await this.replyModel
          .findOne(
            {
              _id: input.target.id,
              postId: input.postId,
              deletedAt: { $exists: true },
            },
            '_id postId parentReplyId deletedAt',
            { session },
          )
          .lean<HotReplyVisibilitySource | null>();
        if (!reply) return false;
        return this.isReplyBranchVisible(reply, session);
      }
      default: {
        const exhaustiveTarget: never = input.target;
        throw new Error(`评价目标类型无效: ${String(exhaustiveTarget)}`);
      }
    }
  }

  private async recordReplyState(
    replyId: string,
    scheduleFeedbackFanout: boolean,
    session: ClientSession,
  ): Promise<void> {
    const reply = await this.replyModel
      .findOne({ _id: replyId, deletedAt: { $exists: true } }, null, { session })
      .select('_id postId authorId authorOwnerUserIdSnapshot parentReplyId createdAt deletedAt')
      .lean<HotReplySource | null>();
    if (!reply) throw new Error(`回复不存在，无法记录热度变化: ${replyId}`);
    const state = await this.requireState(reply.postId, session);
    const branchVisible = await this.isReplyBranchVisible(reply, session);
    const contributionChanged = await this.upsertWorkItem(
      {
        sourceType: HOT_PROJECTION_SOURCE_TYPES.REPLY,
        sourceId: reply._id.toString(),
        postId: reply.postId,
        participantAgentId: reply.authorId,
        participantOwnerUserId: reply.authorOwnerUserIdSnapshot,
        desiredActive: branchVisible && reply.authorOwnerUserIdSnapshot !== state.authorOwnerUserId,
        desiredSourceExists: true,
        desiredActivityAt: reply.createdAt,
      },
      session,
    );
    if (scheduleFeedbackFanout) {
      await this.scheduleReplyFeedbackFanout(replyId, reply.postId, session);
      if (reply.parentReplyId === null) {
        await this.scheduleReplyBranchFanout(replyId, reply.postId, session);
      }
    }
    if (contributionChanged || scheduleFeedbackFanout) {
      await this.markStateProjectionDirty(state._id, session);
    }
  }

  private async isReplyBranchVisible(
    reply: HotReplyVisibilitySource,
    session: ClientSession,
  ): Promise<boolean> {
    if (reply.deletedAt !== null) return false;
    if (reply.parentReplyId === null) return true;
    const rootReply = await this.replyModel
      .findOne(
        {
          _id: reply.parentReplyId,
          postId: reply.postId,
          parentReplyId: null,
          deletedAt: { $exists: true },
        },
        '_id deletedAt',
        { session },
      )
      .lean<HotRootReplyVisibilitySource | null>();
    if (!rootReply) {
      throw new Error(`二级回复对应的一级回复不存在: ${reply.parentReplyId}`);
    }
    return rootReply.deletedAt === null;
  }

  private async scheduleReplyFeedbackFanout(
    replyId: string,
    postId: string,
    session: ClientSession,
  ): Promise<void> {
    await this.fanoutModel.updateOne(
      { replyId },
      {
        $setOnInsert: { replyId, postId, processedVersion: 0 },
        $set: { cursorFeedbackId: null, dirty: true, claimedUntil: null },
        $inc: { version: 1 },
      },
      { upsert: true, session },
    );
  }

  private async scheduleReplyBranchFanout(
    rootReplyId: string,
    postId: string,
    session: ClientSession,
  ): Promise<void> {
    await this.branchFanoutModel.updateOne(
      { rootReplyId },
      {
        $setOnInsert: { rootReplyId, postId, processedVersion: 0 },
        $set: { cursorReplyId: null, dirty: true, claimedUntil: null },
        $inc: { version: 1 },
      },
      { upsert: true, session },
    );
  }

  private async ensureState(postId: string, session: ClientSession) {
    const post = await this.readPost(postId, session);
    const author = await this.agentModel
      .findOne({ _id: post.authorId, deletedAt: { $exists: true } }, 'userId', { session })
      .lean<HotAgentOwnerSource | null>();
    if (!author) throw new Error(`帖子作者不存在，无法初始化热度状态: ${post.authorId}`);
    const state = await this.stateModel.findOneAndUpdate(
      { postId },
      {
        $setOnInsert: {
          postId,
          authorAgentId: post.authorId,
          authorOwnerUserId: author.userId,
          postCreatedAt: post.createdAt,
          participantCount: 0,
          positiveOwnerCount: 0,
          effectiveReplyCount: 0,
          score: 0,
          lastActiveAt: post.createdAt,
          eligible: false,
          expiresAt: null,
          signalVersion: 0,
          projectionVersion: 0,
          projectionDirty: false,
          projectionDispatchAt: null,
          projectionClaimedUntil: null,
          projectionDispatchAttempts: 0,
          candidateVersion: 0,
          candidateSyncedVersion: 0,
          candidateDirty: false,
          candidateDispatchAt: null,
          candidateClaimedUntil: null,
          candidateDispatchAttempts: 0,
        },
        $set: {
          circleId: post.circleId,
          postVisible: post.deletedAt === null,
          circleVisible: post.circleVisible,
          circleVisibilityVersion: post.circleVisibilityVersion,
        },
      },
      { upsert: true, new: true, session },
    );
    if (!state) throw new Error(`无法创建帖子热度状态: ${postId}`);
    if (state.authorAgentId !== post.authorId) {
      throw new Error(`帖子作者与热度状态不一致: ${postId}`);
    }
    return state;
  }

  private async readPost(postId: string, session: ClientSession): Promise<HotPostSource> {
    const post = await this.postModel
      .findOne({ _id: postId, deletedAt: { $exists: true } }, null, { session })
      .select('_id authorId circleId circleVisible circleVisibilityVersion createdAt deletedAt')
      .lean<HotPostSource | null>();
    if (!post) throw new Error(`帖子不存在，无法维护热度状态: ${postId}`);
    return post;
  }

  private async requireState(postId: string, session: ClientSession) {
    const state = await this.stateModel.findOne({ postId }, null, { session });
    if (!state) throw new Error(`帖子热度状态不存在: ${postId}`);
    return state;
  }

  private async upsertWorkItem(
    input: {
      sourceType: HotProjectionSourceType;
      sourceId: string;
      postId: string;
      participantAgentId: string;
      participantOwnerUserId: string;
      desiredActive: boolean;
      desiredSourceExists: boolean;
      desiredActivityAt: Date;
    },
    session: ClientSession,
  ): Promise<boolean> {
    const key = hotProjectionSourceKey(input.sourceType, input.sourceId);
    const existing = await this.workItemModel.findOne({ sourceKey: key }, null, { session });
    if (!existing) {
      if (!input.desiredActive) return false;
      await new this.workItemModel({
        sourceKey: key,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postId: input.postId,
        participantAgentId: input.participantAgentId,
        participantOwnerUserId: input.participantOwnerUserId,
        desiredActive: true,
        desiredSourceExists: input.desiredSourceExists,
        desiredActivityAt: input.desiredActivityAt,
        projectedActive: false,
        projectedActivityAt: null,
        version: 1,
        processedVersion: 0,
        dirty: true,
        claimedUntil: null,
      }).save({ session });
      return true;
    }
    if (
      existing.sourceType !== input.sourceType ||
      existing.sourceId !== input.sourceId ||
      existing.postId !== input.postId ||
      existing.participantAgentId !== input.participantAgentId ||
      existing.participantOwnerUserId !== input.participantOwnerUserId
    ) {
      throw new Error(`热度工作项来源快照不一致: ${key}`);
    }

    const activeActivityChanged =
      input.desiredActive &&
      existing.desiredActivityAt.getTime() !== input.desiredActivityAt.getTime();
    const desiredStateChanged =
      existing.desiredActive !== input.desiredActive ||
      existing.desiredSourceExists !== input.desiredSourceExists ||
      activeActivityChanged;
    if (!desiredStateChanged) return false;

    if (
      !existing.dirty &&
      !existing.projectedActive &&
      !input.desiredActive &&
      !input.desiredSourceExists &&
      input.sourceType === HOT_PROJECTION_SOURCE_TYPES.FEEDBACK
    ) {
      await this.workItemModel.deleteOne(
        { _id: existing._id, version: existing.version },
        { session },
      );
      return false;
    }

    const updated = await this.workItemModel.updateOne(
      { _id: existing._id, version: existing.version },
      {
        $set: {
          desiredActive: input.desiredActive,
          desiredSourceExists: input.desiredSourceExists,
          desiredActivityAt: input.desiredActivityAt,
          dirty: true,
          claimedUntil: null,
        },
        $inc: { version: 1 },
      },
      { session },
    );
    if (updated.matchedCount !== 1) {
      throw new Error(`热度工作项发生并发变化: ${key}`);
    }
    return true;
  }

  private async markStateProjectionDirty(
    stateId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    await this.stateModel.updateOne(
      { _id: stateId },
      {
        $set: {
          projectionDirty: true,
          projectionDispatchAt: null,
          projectionClaimedUntil: null,
          projectionDispatchAttempts: 0,
        },
        $inc: { signalVersion: 1 },
      },
      { session, timestamps: false },
    );
  }
}
