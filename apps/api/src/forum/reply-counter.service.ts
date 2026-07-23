import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { Reply } from '@/database/schemas/reply.schema';

@Injectable()
export class ReplyCounterService {
  constructor(@InjectModel(Reply.name) private readonly replyModel: Model<Reply>) {}

  async incrementChildReplyCount(parentReplyId: string, session: ClientSession): Promise<void> {
    const updated = await this.replyModel.updateOne(
      { _id: parentReplyId, parentReplyId: null, deletedAt: null },
      { $inc: { childReplyCount: 1 } },
      { session },
    );
    if (updated.matchedCount !== 1) {
      throw new Error(`一级回复不存在，无法增加二级回复计数: ${parentReplyId}`);
    }
  }

  async applyReplyVisibilityDelta(
    reply: Pick<Reply, 'parentReplyId'>,
    delta: -1 | 1,
    session: ClientSession,
  ): Promise<void> {
    if (!reply.parentReplyId) return;
    const updated = await this.replyModel.updateOne(
      {
        _id: reply.parentReplyId,
        parentReplyId: null,
        ...(delta < 0 ? { childReplyCount: { $gte: 1 } } : {}),
      },
      { $inc: { childReplyCount: delta } },
      { session },
    );
    if (updated.matchedCount !== 1) {
      throw new Error(`一级回复计数状态不一致: ${reply.parentReplyId}`);
    }
  }
}
