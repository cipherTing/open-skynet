import { BadRequestException } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  AgentNotification,
  AgentNotificationSchema,
} from '@/database/schemas/agent-notification.schema';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import {
  PostWatchRegistry,
  PostWatchRegistrySchema,
} from '@/database/schemas/post-watch-registry.schema';
import { DatabaseService } from '@/database/database.service';
import { InboxService } from './inbox.service';

describe('InboxService integration', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let databaseService: DatabaseService;
  let inboxService: InboxService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: AgentNotification.name, schema: AgentNotificationSchema },
          { name: Agent.name, schema: AgentSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: PostWatchRegistry.name, schema: PostWatchRegistrySchema },
        ]),
      ],
      providers: [DatabaseService, InboxService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    databaseService = moduleRef.get(DatabaseService);
    inboxService = moduleRef.get(InboxService);
  });

  beforeEach(async () => {
    await Promise.all([
      connection.model(AgentNotification.name).deleteMany({}),
      connection.model(Reply.name).deleteMany({}),
      connection.model(Post.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
      connection.model(PostWatchRegistry.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  async function createAgent(label: string) {
    return connection.model(Agent.name).create({
      name: label,
      description: `${label} description`,
      avatarSeed: `${label}-avatar`,
      userId: `${label}-user`,
    });
  }

  async function createPost(authorId: string, label: string) {
    return connection.model(Post.name).create({
      title: `${label} title`,
      content: `${label} content`,
      authorId,
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
    });
  }

  it('merges deterministic reasons and excludes self notifications', async () => {
    const [actor, recipient, mentioned] = await Promise.all([
      createAgent('actor'),
      createAgent('recipient'),
      createAgent('mentioned'),
    ]);
    const post = await createPost(recipient.id, 'thread');
    const replyId = new Types.ObjectId();

    await databaseService.$transaction(async (session) => {
      await connection.model(Reply.name).create(
        [
          {
            _id: replyId,
            content: 'reply content',
            postId: post.id,
            authorId: actor.id,
            parentReplyId: null,
            circleRulesVersion: 1,
          },
        ],
        { session },
      );
      await inboxService.createForReply(
        {
          actorAgentId: actor.id,
          postAuthorId: recipient.id,
          parentReplyAuthorId: recipient.id,
          postId: post.id,
          replyId: replyId.toString(),
          mentionedAgentIds: [recipient.id, mentioned.id, actor.id],
        },
        session,
      );
    });

    const notifications = await connection
      .model(AgentNotification.name)
      .find()
      .sort({ recipientAgentId: 1 });
    expect(notifications).toHaveLength(2);
    expect(
      notifications.find((item) => item.recipientAgentId === recipient.id)?.reasons,
    ).toEqual(['POST_REPLY', 'REPLY_REPLY', 'MENTION']);
    expect(
      notifications.find((item) => item.recipientAgentId === mentioned.id)?.reasons,
    ).toEqual(['MENTION']);
    expect(notifications.some((item) => item.recipientAgentId === actor.id)).toBe(false);
  });

  it('merges watched-post reasons and ignores the actor or deleted watchers', async () => {
    const [actor, recipient, watcher, deletedWatcher] = await Promise.all([
      createAgent('watch-reason-actor'),
      createAgent('watch-reason-recipient'),
      createAgent('watch-reason-watcher'),
      createAgent('watch-reason-deleted'),
    ]);
    const post = await createPost(recipient.id, 'watch-reason-thread');
    await connection.model(PostWatchRegistry.name).create({
      postId: post.id,
      watcherAgentIds: [recipient.id, watcher.id, deletedWatcher.id, actor.id],
    });
    await connection
      .model(Agent.name)
      .findByIdAndUpdate(deletedWatcher.id, { deletedAt: new Date() });

    await inboxService.createForReply({
      actorAgentId: actor.id,
      postAuthorId: recipient.id,
      parentReplyAuthorId: null,
      postId: post.id,
      replyId: new Types.ObjectId().toString(),
      mentionedAgentIds: [recipient.id],
    });

    const notifications = await connection.model(AgentNotification.name).find();
    expect(notifications).toHaveLength(2);
    expect(
      notifications.find((item) => item.recipientAgentId === recipient.id)?.reasons,
    ).toEqual(['POST_REPLY', 'MENTION', 'WATCHED_POST_REPLY']);
    expect(
      notifications.find((item) => item.recipientAgentId === watcher.id)?.reasons,
    ).toEqual(['WATCHED_POST_REPLY']);
    expect(notifications.some((item) => item.recipientAgentId === actor.id)).toBe(false);
    expect(
      notifications.some((item) => item.recipientAgentId === deletedWatcher.id),
    ).toBe(false);
  });

  it('rejects an oversized post watch registry instead of truncating recipients', async () => {
    const [actor, recipient] = await Promise.all([
      createAgent('oversized-watch-actor'),
      createAgent('oversized-watch-recipient'),
    ]);
    const post = await createPost(recipient.id, 'oversized-watch-thread');
    await connection.collection('post_watch_registries').insertOne({
      postId: post.id,
      watcherAgentIds: Array.from(
        { length: 101 },
        () => new Types.ObjectId().toString(),
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      inboxService.createForReply({
        actorAgentId: actor.id,
        postAuthorId: recipient.id,
        parentReplyAuthorId: null,
        postId: post.id,
        replyId: new Types.ObjectId().toString(),
        mentionedAgentIds: [],
      }),
    ).rejects.toThrow('Post watch registry invariant violated');
    expect(await connection.model(AgentNotification.name).countDocuments()).toBe(0);
  });

  it('rolls back the reply when notification creation fails', async () => {
    const [actor, recipient] = await Promise.all([
      createAgent('rollback-actor'),
      createAgent('rollback-recipient'),
    ]);
    const post = await createPost(recipient.id, 'rollback-thread');
    const replyId = new Types.ObjectId();

    await expect(
      databaseService.$transaction(async (session) => {
        await connection.model(Reply.name).create(
          [
            {
              _id: replyId,
              content: 'must roll back',
              postId: post.id,
              authorId: actor.id,
              parentReplyId: null,
              circleRulesVersion: 1,
            },
          ],
          { session },
        );
        await inboxService.createForReply(
          {
            actorAgentId: actor.id,
            postAuthorId: recipient.id,
            parentReplyAuthorId: null,
            postId: post.id,
            replyId: replyId.toString(),
            mentionedAgentIds: [new Types.ObjectId().toString()],
          },
          session,
        );
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await connection.model(Reply.name).countDocuments({ _id: replyId })).toBe(0);
    expect(await connection.model(AgentNotification.name).countDocuments()).toBe(0);
  });

  it('rejects mentions of deleted agents', async () => {
    const [actor, recipient, deletedAgent] = await Promise.all([
      createAgent('deleted-mention-actor'),
      createAgent('deleted-mention-recipient'),
      createAgent('deleted-mentioned-agent'),
    ]);
    await connection
      .model(Agent.name)
      .findByIdAndUpdate(deletedAgent.id, { deletedAt: new Date() });

    await expect(
      inboxService.createForReply({
        actorAgentId: actor.id,
        postAuthorId: recipient.id,
        parentReplyAuthorId: null,
        postId: new Types.ObjectId().toString(),
        replyId: new Types.ObjectId().toString(),
        mentionedAgentIds: [deletedAgent.id],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses a stable cursor, preserves read timestamps, and hides removed sources', async () => {
    const [actor, recipient] = await Promise.all([
      createAgent('reader-actor'),
      createAgent('reader-recipient'),
    ]);
    const post = await createPost(recipient.id, 'reader-thread');
    const replyIds = [new Types.ObjectId(), new Types.ObjectId()];
    for (const replyId of replyIds) {
      await connection.model(Reply.name).create({
        _id: replyId,
        content: `content ${replyId.toString()}`,
        postId: post.id,
        authorId: actor.id,
        parentReplyId: null,
        circleRulesVersion: 1,
      });
      await inboxService.createForReply({
        actorAgentId: actor.id,
        postAuthorId: recipient.id,
        parentReplyAuthorId: null,
        postId: post.id,
        replyId: replyId.toString(),
        mentionedAgentIds: [],
      });
    }

    const firstPage = await inboxService.list(recipient.id, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPage.unreadCount).toBe(2);
    const secondPage = await inboxService.list(recipient.id, {
      limit: 1,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);

    const firstRead = await inboxService.markOneRead(recipient.id, firstPage.items[0].id);
    const secondRead = await inboxService.markOneRead(recipient.id, firstPage.items[0].id);
    expect(secondRead.readAt).toBe(firstRead.readAt);
    expect((await inboxService.list(recipient.id, { limit: 10 })).unreadCount).toBe(1);

    await connection.model(Agent.name).findByIdAndUpdate(actor.id, { deletedAt: new Date() });
    const offlineActorItems = await inboxService.list(recipient.id, { limit: 10 });
    expect(offlineActorItems.items.every((item) => item.source.available)).toBe(true);
    expect(
      offlineActorItems.items.every(
        (item) => !item.source.available || item.source.actor.name === '已离线 Agent',
      ),
    ).toBe(true);

    await connection.model(Post.name).findByIdAndUpdate(post.id, { deletedAt: new Date() });
    const hidden = await inboxService.list(recipient.id, { limit: 10 });
    expect(hidden.items.every((item) => item.source.available === false)).toBe(true);
  });

  it('marks only the current recipient notifications as read', async () => {
    const [actor, firstRecipient, secondRecipient] = await Promise.all([
      createAgent('mark-all-actor'),
      createAgent('mark-all-first'),
      createAgent('mark-all-second'),
    ]);
    const replyId = new Types.ObjectId().toString();
    await inboxService.createForReply({
      actorAgentId: actor.id,
      postAuthorId: firstRecipient.id,
      parentReplyAuthorId: null,
      postId: new Types.ObjectId().toString(),
      replyId,
      mentionedAgentIds: [secondRecipient.id],
    });

    const result = await inboxService.markAllRead(firstRecipient.id);
    expect(result.updatedCount).toBe(1);
    expect(result.throughCursor).not.toBeNull();
    expect((await inboxService.list(firstRecipient.id, { limit: 10, unreadOnly: 'true' })).items)
      .toHaveLength(0);
    expect((await inboxService.list(secondRecipient.id, { limit: 10 })).unreadCount).toBe(1);

    const secondNotification = await connection
      .model(AgentNotification.name)
      .findOne({ recipientAgentId: secondRecipient.id });
    await expect(
      inboxService.markOneRead(firstRecipient.id, secondNotification!.id),
    ).rejects.toThrow('通知不存在');
  });
});
