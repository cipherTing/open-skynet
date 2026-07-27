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
import {
  CURSOR_PAGINATION_DEFAULT_LIMIT,
  type CursorPaginationDto,
} from '@/common/dto/cursor-pagination.dto';
import {
  decodeTimestampCursor,
  encodeTimestampCursor,
  RESOURCE_CURSOR_KINDS,
} from '@/common/pagination/resource-cursor';
import { CircleService } from '@/circle/circle.service';

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
    private readonly circleService: CircleService,
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

  async list(agentId: string, dto: CursorPaginationDto) {
    await this.ensureAgentExists(agentId);
    const limit = dto.limit ?? CURSOR_PAGINATION_DEFAULT_LIMIT;
    const cursor = dto.cursor
      ? decodeTimestampCursor(dto.cursor, RESOURCE_CURSOR_KINDS.AGENT_INTERACTIONS, agentId)
      : null;
    const candidates = await this.interactionHistoryModel
      .find({
        agentId,
        ...(cursor
          ? {
              $or: [
                { createdAt: { $lt: cursor.timestamp } },
                { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);
    const hasMore = candidates.length > limit;
    const histories = hasMore ? candidates.slice(0, limit) : candidates;

    const postIds = [...new Set(histories.map((history) => history.postId))];
    const replyIds = [
      ...new Set(
        histories
          .map((history) => history.replyId)
          .filter((replyId): replyId is string => replyId !== null),
      ),
    ];
    const [candidatePosts, availableReplies] = await Promise.all([
      postIds.length > 0
        ? this.postModel
            .find({ _id: { $in: postIds }, deletedAt: null, circleVisible: true })
            .select('_id circleId')
        : [],
      replyIds.length > 0
        ? this.replyModel
            .find({ _id: { $in: replyIds }, deletedAt: null })
            .select('_id parentReplyId')
        : [],
    ]);
    const activeCircleIds = new Set(
      await this.circleService.filterActiveCircleIds([
        ...new Set(candidatePosts.map((post) => post.circleId)),
      ]),
    );
    const availablePostIds = new Set(
      candidatePosts.filter((post) => activeCircleIds.has(post.circleId)).map((post) => post.id),
    );
    const parentReplyIds = [
      ...new Set(
        availableReplies
          .map((reply) => reply.parentReplyId)
          .filter((replyId): replyId is string => replyId !== null),
      ),
    ];
    const availableParentReplyIds = new Set(
      parentReplyIds.length > 0
        ? (
            await this.replyModel
              .find({ _id: { $in: parentReplyIds }, deletedAt: null })
              .select('_id')
          ).map((reply) => reply.id)
        : [],
    );
    const availableReplyIds = new Set(
      availableReplies
        .filter(
          (reply) =>
            reply.parentReplyId === null || availableParentReplyIds.has(reply.parentReplyId),
        )
        .map((reply) => reply.id),
    );

    return {
      items: histories
        .filter((history) => {
          const postAvailable = availablePostIds.has(history.postId);
          const replyAvailable = history.replyId === null || availableReplyIds.has(history.replyId);
          return history.targetType === FEEDBACK_TARGET_TYPES.POST
            ? postAvailable
            : postAvailable && replyAvailable;
        })
        .map((history) => ({
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
            available: true,
          },
          reply: history.replyId
            ? {
                id: history.replyId,
                excerpt: history.replyExcerptSnapshot ?? '',
                available: true,
              }
            : null,
          targetAvailable: true,
          createdAt: history.createdAt.toISOString(),
        })),
      nextCursor:
        hasMore && histories.length > 0
          ? encodeTimestampCursor(
              RESOURCE_CURSOR_KINDS.AGENT_INTERACTIONS,
              agentId,
              histories[histories.length - 1].createdAt,
              histories[histories.length - 1].id,
            )
          : null,
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
