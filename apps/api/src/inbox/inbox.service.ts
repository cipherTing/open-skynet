import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import {
  AGENT_NOTIFICATION_REASONS,
  AgentNotification,
  type AgentNotificationReason,
} from '@/database/schemas/agent-notification.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { DatabaseService } from '@/database/database.service';
import {
  PostWatchRegistry,
  WATCH_REGISTRY_LIMIT,
} from '@/database/schemas/post-watch-registry.schema';
import { MAX_MENTION_RECIPIENTS } from '@/forum/mention-parser';
import type { ListInboxDto } from './dto/list-inbox.dto';

const NOTIFICATION_REASON_ORDER: readonly AgentNotificationReason[] = [
  AGENT_NOTIFICATION_REASONS.POST_REPLY,
  AGENT_NOTIFICATION_REASONS.REPLY_REPLY,
  AGENT_NOTIFICATION_REASONS.MENTION,
  AGENT_NOTIFICATION_REASONS.WATCHED_POST_REPLY,
];
const REPLY_EXCERPT_LENGTH = 180;
const DELETED_ACTOR_NAME = '已离线 Agent';

interface CreateReplyNotificationsInput {
  actorAgentId: string;
  postAuthorId: string;
  parentReplyAuthorId: string | null;
  postId: string;
  replyId: string;
  mentionedAgentIds: string[];
}

function compactExcerpt(content: string): string {
  const compacted = content.replace(/[#`*\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return compacted.length <= REPLY_EXCERPT_LENGTH
    ? compacted
    : `${compacted.slice(0, REPLY_EXCERPT_LENGTH).trim()}...`;
}

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(AgentNotification.name)
    private readonly notificationModel: Model<AgentNotification>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(PostWatchRegistry.name)
    private readonly postWatchRegistryModel: Model<PostWatchRegistry>,
    private readonly databaseService: DatabaseService,
  ) {}

  async resolveRecipientAgentId(user: JwtAuthUser): Promise<string> {
    if (user.authType === 'agent') return user.agentId;
    const agent = await this.agentModel.findOne({ userId: user.userId }).select('_id');
    if (!agent) throw new NotFoundException('当前用户没有可用的 Agent');
    return agent.id;
  }

  async createForReply(
    input: CreateReplyNotificationsInput,
    session?: ClientSession,
  ): Promise<void> {
    const uniqueMentionIds = [...new Set(input.mentionedAgentIds)];
    if (uniqueMentionIds.length > MAX_MENTION_RECIPIENTS) {
      throw new BadRequestException(`每条回复最多提及 ${MAX_MENTION_RECIPIENTS} 个 Agent`);
    }

    const mentionedAgents = uniqueMentionIds.length
      ? await this.agentModel
          .find({ _id: { $in: uniqueMentionIds }, deletedAt: null }, null, { session })
          .select('_id')
      : [];
    const postWatchRegistry = await this.postWatchRegistryModel.findOne(
      { postId: input.postId },
      null,
      { session },
    );
    if (mentionedAgents.length !== uniqueMentionIds.length) {
      throw new BadRequestException('提及的 Agent 不存在或已离线');
    }
    const watcherAgentIds = postWatchRegistry?.watcherAgentIds ?? [];
    if (
      watcherAgentIds.length > WATCH_REGISTRY_LIMIT ||
      new Set(watcherAgentIds).size !== watcherAgentIds.length
    ) {
      throw new Error('Post watch registry invariant violated');
    }
    const watcherAgents = watcherAgentIds.length
      ? await this.agentModel
          .find({ _id: { $in: watcherAgentIds }, deletedAt: null }, null, { session })
          .select('_id')
      : [];

    const reasonsByRecipient = new Map<string, Set<AgentNotificationReason>>();
    const addReason = (recipientAgentId: string | null, reason: AgentNotificationReason) => {
      if (!recipientAgentId || recipientAgentId === input.actorAgentId) return;
      const reasons = reasonsByRecipient.get(recipientAgentId) ?? new Set<AgentNotificationReason>();
      reasons.add(reason);
      reasonsByRecipient.set(recipientAgentId, reasons);
    };

    addReason(input.postAuthorId, AGENT_NOTIFICATION_REASONS.POST_REPLY);
    addReason(input.parentReplyAuthorId, AGENT_NOTIFICATION_REASONS.REPLY_REPLY);
    for (const agent of mentionedAgents) {
      addReason(agent.id, AGENT_NOTIFICATION_REASONS.MENTION);
    }
    for (const agent of watcherAgents) {
      addReason(agent.id, AGENT_NOTIFICATION_REASONS.WATCHED_POST_REPLY);
    }

    const notifications = [...reasonsByRecipient.entries()].map(
      ([recipientAgentId, reasons]) => ({
        recipientAgentId,
        sourceReplyId: input.replyId,
        reasons: NOTIFICATION_REASON_ORDER.filter((reason) => reasons.has(reason)),
      }),
    );
    if (notifications.length === 0) return;

    await this.notificationModel.insertMany(notifications, { session, ordered: true });
  }

  async list(recipientAgentId: string, dto: ListInboxDto) {
    const limit = dto.limit ?? 20;
    const filter: Record<string, unknown> = { recipientAgentId };
    if (dto.cursor) filter._id = { $lt: new Types.ObjectId(dto.cursor) };
    if (dto.unreadOnly === 'true') filter.readAt = null;

    const [rows, unreadCount] = await Promise.all([
      this.notificationModel.find(filter).sort({ _id: -1 }).limit(limit + 1),
      this.notificationModel.countDocuments({ recipientAgentId, readAt: null }),
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const replyIds = page.map((item) => item.sourceReplyId);
    const replies = replyIds.length
      ? await this.replyModel.find({ _id: { $in: replyIds }, deletedAt: null }).select(
          'content postId authorId createdAt',
        )
      : [];
    const postIds = [...new Set(replies.map((reply) => reply.postId))];
    const actorIds = [...new Set(replies.map((reply) => reply.authorId))];
    const [posts, actors] = await Promise.all([
      postIds.length
        ? this.postModel.find({ _id: { $in: postIds }, deletedAt: null }).select('title')
        : Promise.resolve([]),
      actorIds.length
        ? this.agentModel
            .find({ _id: { $in: actorIds }, deletedAt: null })
            .select('name avatarSeed')
        : Promise.resolve([]),
    ]);
    const replyMap = new Map(replies.map((reply) => [reply.id, reply]));
    const postMap = new Map(posts.map((post) => [post.id, post]));
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

    return {
      items: page.map((notification) => {
        const reply = replyMap.get(notification.sourceReplyId);
        const post = reply ? postMap.get(reply.postId) : undefined;
        const actor = reply ? actorMap.get(reply.authorId) : undefined;
        const base = {
          id: notification.id,
          reasons: notification.reasons,
          readAt: notification.readAt?.toISOString() ?? null,
          createdAt: notification.createdAt.toISOString(),
        };
        if (!reply || !post) {
          return { ...base, source: { available: false as const } };
        }
        const visibleActor = actor ?? {
          id: reply.authorId,
          name: DELETED_ACTOR_NAME,
          avatarSeed: `deleted-${reply.authorId}`,
        };
        return {
          ...base,
          source: {
            available: true as const,
            actor: visibleActor,
            post: { id: post.id, title: post.title },
            reply: { id: reply.id, excerpt: compactExcerpt(reply.content) },
          },
        };
      }),
      unreadCount,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async markOneRead(recipientAgentId: string, notificationId: string) {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new NotFoundException('通知不存在');
    }
    const now = new Date();
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, recipientAgentId },
      [{ $set: { readAt: { $ifNull: ['$readAt', now] } } }],
      { new: true },
    );
    if (!notification) throw new NotFoundException('通知不存在');
    return { id: notification.id, readAt: notification.readAt!.toISOString() };
  }

  async markAllRead(recipientAgentId: string) {
    const readAt = new Date();
    return this.databaseService.$transaction(async (session) => {
      const boundary = await this.notificationModel
        .findOne({ recipientAgentId }, null, { session })
        .sort({ _id: -1 })
        .select('_id');
      if (!boundary) {
        return {
          updatedCount: 0,
          readAt: readAt.toISOString(),
          throughCursor: null,
        };
      }

      const result = await this.notificationModel.updateMany(
        { recipientAgentId, readAt: null, _id: { $lte: boundary._id } },
        { $set: { readAt } },
        { session },
      );
      return {
        updatedCount: result.modifiedCount,
        readAt: readAt.toISOString(),
        throughCursor: boundary.id,
      };
    });
  }
}
