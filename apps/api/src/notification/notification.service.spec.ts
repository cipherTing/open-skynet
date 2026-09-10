import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Announcement, AnnouncementSchema } from '@/database/schemas/announcement.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import {
  Notification,
  NotificationSchema,
  NOTIFICATION_KINDS,
  NOTIFICATION_SOURCE_TYPES,
} from '@/database/schemas/notification.schema';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: NotificationService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: Announcement.name, schema: AnnouncementSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: Notification.name, schema: NotificationSchema },
        ]),
      ],
      providers: [NotificationService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(NotificationService);
  });

  beforeEach(async () => {
    await Promise.all([
      connection.model(Notification.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
      connection.model(Post.name).deleteMany({}),
      connection.model(Reply.name).deleteMany({}),
      connection.model(Announcement.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  it('creates one mention notification per recipient and ignores the author', async () => {
    const [author, recipient, secondRecipient] = await createAgents();
    const postId = new Types.ObjectId().toString();

    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.POST,
      sourceId: postId,
      postId,
      actorAgentId: author.id,
      recipientAgentIds: [author.id, recipient.id, recipient.id, secondRecipient.id],
    });
    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.POST,
      sourceId: postId,
      postId,
      actorAgentId: author.id,
      recipientAgentIds: [recipient.id, secondRecipient.id],
    });

    const notifications = await connection
      .model(Notification.name)
      .find()
      .sort({ recipientAgentId: 1 })
      .lean();
    expect(notifications).toHaveLength(2);
    expect(notifications.map((item) => item.recipientAgentId)).toEqual([
      recipient.id,
      secondRecipient.id,
    ]);
    expect(notifications.every((item) => item.kind === NOTIFICATION_KINDS.MENTION)).toBe(true);
  });

  it('paginates unread and type-filtered notifications without marking them read', async () => {
    const [actor, recipient] = await createAgents();
    const firstPostId = new Types.ObjectId().toString();
    const secondPostId = new Types.ObjectId().toString();
    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.POST,
      sourceId: firstPostId,
      postId: firstPostId,
      actorAgentId: actor.id,
      recipientAgentIds: [recipient.id],
    });
    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.POST,
      sourceId: secondPostId,
      postId: secondPostId,
      actorAgentId: actor.id,
      recipientAgentIds: [recipient.id],
    });
    const firstPage = await service.listNotifications(recipient.id, {
      filter: 'mention',
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items[0]).toMatchObject({ kind: NOTIFICATION_KINDS.MENTION, readAt: null });
    const secondPage = await service.listNotifications(recipient.id, {
      filter: 'mention',
      limit: 5,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(await service.getUnreadCounts(recipient.id)).toEqual({ total: 2, mentions: 2 });
  });

  it('marks only the current agent notifications as read in a batch', async () => {
    const [actor, recipient, otherRecipient] = await createAgents();
    const sourceId = new Types.ObjectId().toString();
    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.REPLY,
      sourceId,
      postId: new Types.ObjectId().toString(),
      actorAgentId: actor.id,
      recipientAgentIds: [recipient.id, otherRecipient.id],
    });
    const [currentNotification] = await connection
      .model(Notification.name)
      .find({ recipientAgentId: recipient.id })
      .lean<Array<{ _id: Types.ObjectId }>>();
    if (!currentNotification) throw new Error('Notification fixture was not created');

    expect(
      await service.markRead(recipient.id, [currentNotification._id.toString(), 'invalid']),
    ).toEqual({
      updatedCount: 1,
    });
    expect(await service.getUnreadCounts(recipient.id)).toEqual({ total: 0, mentions: 0 });
    expect(await service.getUnreadCounts(otherRecipient.id)).toEqual({ total: 1, mentions: 1 });
  });

  async function createAgents() {
    const model = connection.model(Agent.name);
    return model.create([
      { name: 'author', description: '', userId: 'author-user' },
      { name: 'recipient', description: '', userId: 'recipient-user' },
      { name: 'second-recipient', description: '', userId: 'second-recipient-user' },
    ]);
  }
});
