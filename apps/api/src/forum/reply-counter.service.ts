import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';

const REPLY_COUNT_DELTAS = {
  INCREMENT: 1,
  DECREMENT: -1,
} as const;

const ROOT_REPLY_SELF_COUNT = 1;

type ReplyCountDelta = (typeof REPLY_COUNT_DELTAS)[keyof typeof REPLY_COUNT_DELTAS];

type ReplyCreationSnapshot = Pick<Reply, 'postId' | 'parentReplyId'>;
type ReplyVisibilitySnapshot = Pick<Reply, 'postId' | 'parentReplyId' | 'childReplyCount'>;

@Injectable()
export class ReplyCounterService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
  ) {}

  async recordReplyCreated(reply: ReplyCreationSnapshot, session: ClientSession): Promise<void> {
    if (reply.parentReplyId) {
      const parent = await this.replyModel.findOneAndUpdate(
        {
          _id: reply.parentReplyId,
          postId: reply.postId,
          parentReplyId: null,
          deletedAt: null,
        },
        { $inc: { childReplyCount: REPLY_COUNT_DELTAS.INCREMENT } },
        { new: true, session },
      );
      if (!parent) {
        throw new Error(`一级回复不存在，无法记录二级回复: ${reply.parentReplyId}`);
      }
    }

    await this.applyPostReplyCountDelta(reply.postId, REPLY_COUNT_DELTAS.INCREMENT, session);
  }

  async recordReplyVisibilityChanged(
    reply: ReplyVisibilitySnapshot,
    visible: boolean,
    session: ClientSession,
  ): Promise<void> {
    const delta: ReplyCountDelta = visible
      ? REPLY_COUNT_DELTAS.INCREMENT
      : REPLY_COUNT_DELTAS.DECREMENT;
    if (!reply.parentReplyId) {
      if (!Number.isInteger(reply.childReplyCount) || reply.childReplyCount < 0) {
        throw new Error(`一级回复的二级回复计数无效: ${reply.postId}`);
      }
      const branchReplyCount = ROOT_REPLY_SELF_COUNT + reply.childReplyCount;
      await this.applyPostReplyCountDelta(reply.postId, delta * branchReplyCount, session);
      return;
    }

    const parent = await this.replyModel.findOneAndUpdate(
      {
        _id: reply.parentReplyId,
        postId: reply.postId,
        parentReplyId: null,
        deletedAt: { $exists: true },
        ...(delta < 0 ? { childReplyCount: { $gte: ROOT_REPLY_SELF_COUNT } } : {}),
      },
      { $inc: { childReplyCount: delta } },
      { new: true, session },
    );
    if (!parent) {
      throw new Error(`一级回复计数状态不一致: ${reply.parentReplyId}`);
    }

    if (parent.deletedAt === null) {
      await this.applyPostReplyCountDelta(reply.postId, delta, session);
    }
  }

  private async applyPostReplyCountDelta(
    postId: string,
    delta: number,
    session: ClientSession,
  ): Promise<void> {
    const updated = await this.postModel.updateOne(
      {
        _id: postId,
        ...(delta < 0 ? { replyCount: { $gte: Math.abs(delta) } } : {}),
      },
      { $inc: { replyCount: delta } },
      { session },
    );
    if (updated.matchedCount !== ROOT_REPLY_SELF_COUNT) {
      throw new Error(`帖子回复计数状态不一致: ${postId}`);
    }
  }
}
