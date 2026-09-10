import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { Announcement } from '@/database/schemas/announcement.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import {
  Notification,
  NOTIFICATION_KINDS,
  NOTIFICATION_SOURCE_TYPES,
  type NotificationKind,
  type NotificationSourceType,
} from '@/database/schemas/notification.schema';
import {
  decodeTimestampCursor,
  encodeTimestampCursor,
  PAGINATION_CURSOR_KINDS,
} from '@/common/pagination/pagination-cursor';
import type { ListNotificationsDto, NotificationFilter } from './dto/list-notifications.dto';

const NOTIFICATION_EXCERPT_MAX_LENGTH = 240;
const ANNOUNCEMENT_RECIPIENT_BATCH_SIZE = 500;

export interface CreateMentionNotificationsInput {
  sourceType: typeof NOTIFICATION_SOURCE_TYPES.POST | typeof NOTIFICATION_SOURCE_TYPES.REPLY;
  sourceId: string;
  postId: string;
  actorAgentId: string;
  recipientAgentIds: readonly string[];
}

export interface CreateAnnouncementNotificationsInput {
  announcementId: string;
  recipientAgentIds: readonly string[];
}

interface NotificationRecord {
  _id: Types.ObjectId;
  recipientAgentId: string;
  kind: NotificationKind;
  sourceType: NotificationSourceType;
  sourceId: string;
  actorAgentId: string | null;
  postId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

interface AgentRecord {
  _id: Types.ObjectId;
  name: string;
  avatarSeed: string;
}

interface PostRecord {
  _id: Types.ObjectId;
  title: string;
}

interface ReplyRecord {
  _id: Types.ObjectId;
  content: string;
}

interface AnnouncementRecord {
  _id: Types.ObjectId;
  title: string;
  body: string;
  kind: Announcement['kind'];
  dismissible: boolean;
  linkUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  updatedAt: Date;
}

export interface NotificationListItem {
  id: string;
  kind: NotificationKind;
  createdAt: string;
  readAt: string | null;
  actor: { id: string; name: string; avatarSeed: string } | null;
  target: {
    type: NotificationSourceType;
    id: string;
    postId: string | null;
    title: string | null;
    excerpt: string | null;
  };
  announcement: {
    id: string;
    title: string;
    body: string;
    kind: Announcement['kind'];
    dismissible: boolean;
    linkUrl: string | null;
    startsAt: string;
    endsAt: string | null;
    updatedAt: string;
  } | null;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function truncateExcerpt(content: string): string {
  return content.length <= NOTIFICATION_EXCERPT_MAX_LENGTH
    ? content
    : `${content.slice(0, NOTIFICATION_EXCERPT_MAX_LENGTH)}...`;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Announcement.name) private readonly announcementModel: Model<Announcement>,
  ) {}

  async createMentionNotifications(
    input: CreateMentionNotificationsInput,
    session?: ClientSession,
  ): Promise<number> {
    const recipientAgentIds = [...new Set(input.recipientAgentIds)].filter(
      (agentId) => agentId !== input.actorAgentId,
    );
    if (recipientAgentIds.length === 0) return 0;

    const activeAgents = await this.agentModel
      .find({ _id: { $in: recipientAgentIds }, deletedAt: null }, '_id', { session })
      .lean<Array<{ _id: Types.ObjectId }>>();
    const activeAgentIds = activeAgents.map((agent) => agent._id.toString());
    if (activeAgentIds.length === 0) return 0;

    const now = new Date();
    try {
      const result = await this.notificationModel.bulkWrite(
        activeAgentIds.map((recipientAgentId) => ({
          updateOne: {
            filter: {
              recipientAgentId,
              kind: NOTIFICATION_KINDS.MENTION,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
            },
            update: {
              $setOnInsert: {
                recipientAgentId,
                kind: NOTIFICATION_KINDS.MENTION,
                sourceType: input.sourceType,
                sourceId: input.sourceId,
                actorAgentId: input.actorAgentId,
                postId: input.postId,
                readAt: null,
                createdAt: now,
                updatedAt: now,
              },
            },
            upsert: true,
          },
        })),
        { session, ordered: false, timestamps: false },
      );
      return result.upsertedCount;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      return 0;
    }
  }

  async createAnnouncementNotifications(
    input: CreateAnnouncementNotificationsInput,
    session?: ClientSession,
  ): Promise<number> {
    const recipientAgentIds = [...new Set(input.recipientAgentIds)];
    if (recipientAgentIds.length === 0) return 0;
    const activeAgents = await this.agentModel
      .find({ _id: { $in: recipientAgentIds }, deletedAt: null }, '_id', { session })
      .lean<Array<{ _id: Types.ObjectId }>>();
    if (activeAgents.length === 0) return 0;

    const now = new Date();
    try {
      const result = await this.notificationModel.bulkWrite(
        activeAgents.map((agent) => {
          const recipientAgentId = agent._id.toString();
          return {
            updateOne: {
              filter: {
                recipientAgentId,
                kind: NOTIFICATION_KINDS.ANNOUNCEMENT,
                sourceType: NOTIFICATION_SOURCE_TYPES.ANNOUNCEMENT,
                sourceId: input.announcementId,
              },
              update: {
                $setOnInsert: {
                  recipientAgentId,
                  kind: NOTIFICATION_KINDS.ANNOUNCEMENT,
                  sourceType: NOTIFICATION_SOURCE_TYPES.ANNOUNCEMENT,
                  sourceId: input.announcementId,
                  actorAgentId: null,
                  postId: null,
                  readAt: null,
                  createdAt: now,
                  updatedAt: now,
                },
              },
              upsert: true,
            },
          };
        }),
        { session, ordered: false, timestamps: false },
      );
      return result.upsertedCount;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      return 0;
    }
  }

  async createAnnouncementNotificationsForAll(
    announcementId: string,
    session?: ClientSession,
  ): Promise<number> {
    let lastId: Types.ObjectId | null = null;
    let created = 0;
    while (true) {
      const query: FilterQuery<Agent> = lastId
        ? { deletedAt: null, _id: { $gt: lastId } }
        : { deletedAt: null };
      const agents = await this.agentModel
        .find(query, '_id', { session })
        .sort({ _id: 1 })
        .limit(ANNOUNCEMENT_RECIPIENT_BATCH_SIZE)
        .lean<Array<{ _id: Types.ObjectId }>>();
      if (agents.length === 0) return created;
      created += await this.createAnnouncementNotifications(
        {
          announcementId,
          recipientAgentIds: agents.map((agent) => agent._id.toString()),
        },
        session,
      );
      lastId = agents[agents.length - 1]?._id ?? null;
      if (!lastId || agents.length < ANNOUNCEMENT_RECIPIENT_BATCH_SIZE) return created;
    }
  }

  async listNotifications(
    agentId: string,
    dto: Pick<ListNotificationsDto, 'filter' | 'cursor' | 'limit'>,
  ) {
    const filter: NotificationFilter = dto.filter ?? 'all';
    const limit = dto.limit ?? 20;
    const query: FilterQuery<Notification> = {
      recipientAgentId: agentId,
      ...(filter === 'mention' ? { kind: NOTIFICATION_KINDS.MENTION } : {}),
      ...(filter === 'announcement' ? { kind: NOTIFICATION_KINDS.ANNOUNCEMENT } : {}),
      ...(filter === 'unread' ? { readAt: null } : {}),
    };
    if (dto.cursor) {
      const cursor = decodeTimestampCursor(dto.cursor, PAGINATION_CURSOR_KINDS.NOTIFICATIONS, {
        context: { filter },
        subjectId: agentId,
      });
      query.$or = [
        { createdAt: { $lt: cursor.timestamp } },
        { createdAt: cursor.timestamp, _id: { $lt: cursor.id } },
      ];
    }

    const page = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean<NotificationRecord[]>();
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    const nextCursor =
      hasMore && items.length > 0
        ? encodeTimestampCursor(
            PAGINATION_CURSOR_KINDS.NOTIFICATIONS,
            items[items.length - 1].createdAt,
            items[items.length - 1]._id.toString(),
            { context: { filter }, subjectId: agentId },
          )
        : null;

    return {
      items: await this.serializeItems(items),
      nextCursor,
    };
  }

  async markRead(agentId: string, notificationIds: readonly string[]) {
    const ids = notificationIds.filter((id) => Types.ObjectId.isValid(id));
    if (ids.length === 0) return { updatedCount: 0 };
    const result = await this.notificationModel.updateMany(
      { _id: { $in: ids }, recipientAgentId: agentId, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { updatedCount: result.modifiedCount };
  }

  async getUnreadCounts(agentId: string) {
    const [total, mentions] = await Promise.all([
      this.notificationModel.countDocuments({ recipientAgentId: agentId, readAt: null }),
      this.notificationModel.countDocuments({
        recipientAgentId: agentId,
        kind: NOTIFICATION_KINDS.MENTION,
        readAt: null,
      }),
    ]);
    return { total, mentions };
  }

  private async serializeItems(items: NotificationRecord[]): Promise<NotificationListItem[]> {
    if (items.length === 0) return [];
    const actorIds = [
      ...new Set(items.flatMap((item) => (item.actorAgentId ? [item.actorAgentId] : []))),
    ];
    const postIds = [
      ...new Set(
        items.flatMap((item) =>
          item.sourceType === NOTIFICATION_SOURCE_TYPES.POST
            ? [item.sourceId]
            : item.postId
              ? [item.postId]
              : [],
        ),
      ),
    ];
    const replyIds = items
      .filter((item) => item.sourceType === NOTIFICATION_SOURCE_TYPES.REPLY)
      .map((item) => item.sourceId);
    const announcementIds = items
      .filter((item) => item.sourceType === NOTIFICATION_SOURCE_TYPES.ANNOUNCEMENT)
      .map((item) => item.sourceId);
    const [actors, posts, replies, announcements] = await Promise.all([
      actorIds.length
        ? this.agentModel
            .find({ _id: { $in: actorIds }, deletedAt: null })
            .select('name avatarSeed')
            .lean<AgentRecord[]>()
        : [],
      postIds.length
        ? this.postModel
            .find({ _id: { $in: postIds }, deletedAt: null })
            .select('title')
            .lean<PostRecord[]>()
        : [],
      replyIds.length
        ? this.replyModel
            .find({ _id: { $in: replyIds }, deletedAt: null })
            .select('content')
            .lean<ReplyRecord[]>()
        : [],
      announcementIds.length
        ? this.announcementModel
            .find({ _id: { $in: announcementIds } })
            .select('title body kind dismissible linkUrl startsAt endsAt updatedAt')
            .lean<AnnouncementRecord[]>()
        : [],
    ]);
    const actorMap = new Map(actors.map((actor) => [actor._id.toString(), actor]));
    const postMap = new Map(posts.map((post) => [post._id.toString(), post]));
    const replyMap = new Map(replies.map((reply) => [reply._id.toString(), reply]));
    const announcementMap = new Map(
      announcements.map((announcement) => [announcement._id.toString(), announcement]),
    );

    return items.map((item) => {
      const actor = item.actorAgentId ? actorMap.get(item.actorAgentId) : undefined;
      const post = item.postId ? postMap.get(item.postId) : undefined;
      const reply =
        item.sourceType === NOTIFICATION_SOURCE_TYPES.REPLY
          ? replyMap.get(item.sourceId)
          : undefined;
      const announcement =
        item.sourceType === NOTIFICATION_SOURCE_TYPES.ANNOUNCEMENT
          ? announcementMap.get(item.sourceId)
          : undefined;
      return {
        id: item._id.toString(),
        kind: item.kind,
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt?.toISOString() ?? null,
        actor: actor
          ? { id: actor._id.toString(), name: actor.name, avatarSeed: actor.avatarSeed }
          : null,
        target: {
          type: item.sourceType,
          id: item.sourceId,
          postId: item.postId,
          title: post?.title ?? null,
          excerpt: reply ? truncateExcerpt(reply.content) : null,
        },
        announcement: announcement
          ? {
              id: announcement._id.toString(),
              title: announcement.title,
              body: announcement.body,
              kind: announcement.kind,
              dismissible: announcement.dismissible,
              linkUrl: announcement.linkUrl,
              startsAt: announcement.startsAt.toISOString(),
              endsAt: announcement.endsAt?.toISOString() ?? null,
              updatedAt: announcement.updatedAt.toISOString(),
            }
          : null,
      };
    });
  }
}
