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
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { validate } from 'class-validator';

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
    await connection.model(Notification.name).init();
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

  it('does not add a mention or reset read state for an already notified reply source', async () => {
    const [author, recipient] = await createAgents();
    const sourceId = new Types.ObjectId().toString();
    const postId = new Types.ObjectId().toString();
    const createdAt = new Date('2026-11-09T10:00:00Z');
    const readAt = new Date('2026-11-09T11:00:00Z');
    await connection.collection('notifications').insertOne({
      recipientAgentId: recipient.id,
      kind: 'REPLY',
      sourceType: 'REPLY',
      sourceId,
      actorAgentId: author.id,
      postId,
      readAt,
      createdAt,
      updatedAt: createdAt,
    });
    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.REPLY,
      sourceId,
      postId,
      actorAgentId: author.id,
      recipientAgentIds: [recipient.id],
    });
    const records = await connection
      .model(Notification.name)
      .find({ recipientAgentId: recipient.id, sourceId })
      .lean();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'REPLY', createdAt, readAt });
    expect(await service.getUnreadCounts(recipient.id)).toEqual({ total: 0, mentions: 0 });
  });

  it('filters reply notifications separately from mentions and counts all unread kinds', async () => {
    const [author, recipient] = await createAgents();
    const postId = new Types.ObjectId().toString();
    const sourceId = new Types.ObjectId().toString();
    await connection.collection('notifications').insertOne({
      recipientAgentId: recipient.id,
      kind: 'REPLY',
      sourceType: 'REPLY',
      sourceId,
      actorAgentId: author.id,
      postId,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.POST,
      sourceId: postId,
      postId,
      actorAgentId: author.id,
      recipientAgentIds: [recipient.id],
    });
    const query = Object.assign(new ListNotificationsDto(), { filter: 'reply', limit: 10 });
    expect(await validate(query)).toEqual([]);
    const replies = await service.listNotifications(recipient.id, query);
    expect(replies.items).toHaveLength(1);
    expect(replies.items[0]).toMatchObject({ kind: 'REPLY', target: { id: sourceId } });
    expect(
      (await service.listNotifications(recipient.id, { filter: 'mention', limit: 10 })).items,
    ).toHaveLength(1);
    expect(
      (await service.listNotifications(recipient.id, { filter: 'unread', limit: 10 })).items,
    ).toHaveLength(2);
    expect(await service.getUnreadCounts(recipient.id)).toEqual({ total: 2, mentions: 1 });
  });

  it('enforces source identity across notification kinds in the unique index', async () => {
    const [author, recipient] = await createAgents();
    const sourceId = new Types.ObjectId().toString();
    const postId = new Types.ObjectId().toString();
    await service.createMentionNotifications({
      sourceType: NOTIFICATION_SOURCE_TYPES.REPLY,
      sourceId,
      postId,
      actorAgentId: author.id,
      recipientAgentIds: [recipient.id],
    });
    await expect(
      connection.collection('notifications').insertOne({
        recipientAgentId: recipient.id,
        kind: 'REPLY',
        sourceType: 'REPLY',
        sourceId,
        actorAgentId: author.id,
        postId,
        readAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(
      await connection
        .model(Notification.name)
        .countDocuments({ recipientAgentId: recipient.id, sourceId }),
    ).toBe(1);
  });

  it('keeps concurrent reply notification delivery unique and excludes self and inactive recipients', async () => {
    const [author, recipient, inactive] = await createAgents();
    await connection
      .model(Agent.name)
      .updateOne({ _id: inactive.id }, { $set: { deletedAt: new Date() } });
    const input = {
      sourceId: new Types.ObjectId().toString(),
      postId: new Types.ObjectId().toString(),
      actorAgentId: author.id,
      replyRecipientAgentIds: [recipient.id, recipient.id, inactive.id, author.id],
      mentionedAgentIds: [recipient.id, inactive.id, author.id],
    };
    await Promise.all(
      Array.from({ length: 3 }, () => service.createForumReplyNotifications(input)),
    );
    const received = await service.listNotifications(recipient.id, { filter: 'reply', limit: 10 });
    expect(received.items).toEqual([
      expect.objectContaining({
        kind: 'REPLY',
        target: expect.objectContaining({ id: input.sourceId, postId: input.postId }),
      }),
    ]);
    expect(await connection.model(Notification.name).countDocuments()).toBe(1);
    const original = received.items[0];
    if (!original) throw new Error('Reply notification was not delivered');
    await service.markRead(recipient.id, [original.id]);
    const read = (await service.listNotifications(recipient.id, { filter: 'reply', limit: 10 }))
      .items[0];
    await service.createForumReplyNotifications(input);
    expect(
      (await service.listNotifications(recipient.id, { filter: 'reply', limit: 10 })).items[0],
    ).toEqual(read);
    expect(await service.getUnreadCounts(recipient.id)).toEqual({ total: 0, mentions: 0 });
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
