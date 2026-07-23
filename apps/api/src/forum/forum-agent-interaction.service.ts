import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { commonErrors } from '@/common/errors/business-errors';
import { translateApiText } from '@/common/i18n/api-language';
import { Agent } from '@/database/schemas/agent.schema';
import {
  InteractionHistory,
  type InteractionTargetType,
} from '@/database/schemas/interaction-history.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { FEEDBACK_TARGET_TYPES, type FeedbackType } from '@/forum/feedback.constants';

const INTERACTION_SNAPSHOT_MAX_LENGTH = 120;

interface AgentSnapshot {
  id: string;
  name: string;
  avatarSeed: string;
}

export interface RecordFeedbackInteractionInput {
  agentId: string;
  feedbackType: FeedbackType;
  targetType: InteractionTargetType;
  postId: string;
  postTitle: string;
  targetAuthorId: string;
  replyId?: string | null;
  replyContent?: string | null;
}

function compactSnapshotText(text: string): string {
  const compacted = text
    .replace(/[#`*\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compacted.length <= INTERACTION_SNAPSHOT_MAX_LENGTH) return compacted;
  return `${compacted.slice(0, INTERACTION_SNAPSHOT_MAX_LENGTH).trim()}...`;
}

function ensureValidAgentId(agentId: string): void {
  if (!/^[a-f\d]{24}$/i.test(agentId) || !Types.ObjectId.isValid(agentId)) {
    throw commonErrors.agentNotFound();
  }
}

@Injectable()
export class ForumAgentInteractionService {
  constructor(
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(InteractionHistory.name)
    private readonly interactionHistoryModel: Model<InteractionHistory>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
  ) {}

  async recordFeedback(
    input: RecordFeedbackInteractionInput,
    session?: ClientSession,
  ): Promise<void> {
    const agent = await this.getAgentSnapshot(input.agentId, session);
    const targetAuthor = await this.getAgentSnapshot(input.targetAuthorId, session);
    const history = new this.interactionHistoryModel({
      type: 'GAVE_FEEDBACK',
      feedbackType: input.feedbackType,
      targetType: input.targetType,
      agentId: agent.id,
      agentNameSnapshot: agent.name,
      agentAvatarSeedSnapshot: agent.avatarSeed,
      targetAuthorId: targetAuthor.id,
      targetAuthorNameSnapshot: targetAuthor.name,
      targetAuthorAvatarSeedSnapshot: targetAuthor.avatarSeed,
      postId: input.postId,
      postTitleSnapshot: compactSnapshotText(input.postTitle),
      replyId: input.replyId ?? null,
      replyExcerptSnapshot: input.replyContent ? compactSnapshotText(input.replyContent) : null,
    });
    await history.save({ session });
  }

  async list(agentId: string, page: number, pageSize: number) {
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
        ? this.postModel.find({ _id: { $in: postIds }, deletedAt: null }).select('_id')
        : [],
      replyIds.length > 0 ? this.replyModel.find({ _id: { $in: replyIds } }).select('_id') : [],
    ]);
    const availablePostIds = new Set(availablePosts.map((post) => post.id));
    const availableReplyIds = new Set(availableReplies.map((reply) => reply.id));

    return {
      interactions: histories.map((history) => {
        const postAvailable = availablePostIds.has(history.postId);
        const replyAvailable = history.replyId === null || availableReplyIds.has(history.replyId);
        const targetAvailable =
          history.targetType === FEEDBACK_TARGET_TYPES.POST
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
                excerpt: history.replyExcerptSnapshot ?? '',
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

  private async ensureAgentExists(agentId: string): Promise<void> {
    ensureValidAgentId(agentId);
    const exists = await this.agentModel.exists({ _id: agentId });
    if (!exists) throw commonErrors.agentNotFound();
  }

  private async getAgentSnapshot(agentId: string, session?: ClientSession): Promise<AgentSnapshot> {
    const agent = await this.agentModel
      .findById(agentId, null, { session })
      .select('name avatarSeed');
    if (!agent) {
      return {
        id: agentId,
        name: translateApiText('api.labels.offlineAgent', 'Offline Agent'),
        avatarSeed: `deleted-${agentId}`,
      };
    }
    return { id: agent.id, name: agent.name, avatarSeed: agent.avatarSeed };
  }
}
