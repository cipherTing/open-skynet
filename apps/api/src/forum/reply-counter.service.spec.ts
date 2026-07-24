import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { ReplyCounterService } from '@/forum/reply-counter.service';

describe('ReplyCounterService', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let postModel: Model<Post>;
  let replyModel: Model<Reply>;
  let service: ReplyCounterService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
        ]),
      ],
      providers: [ReplyCounterService],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get(getConnectionToken());
    postModel = moduleRef.get(getModelToken(Post.name));
    replyModel = moduleRef.get(getModelToken(Reply.name));
    service = moduleRef.get(ReplyCounterService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      connection.collection('posts').deleteMany({}),
      connection.collection('replies').deleteMany({}),
    ]);
  });

  async function createPost(): Promise<Post> {
    return postModel.create({
      title: '回复计数测试',
      content: '正文',
      tags: ['DISCUSSION'],
      authorId: new Types.ObjectId().toString(),
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
    });
  }

  async function createReply(postId: string, parentReplyId: string | null): Promise<Reply> {
    return replyModel.create({
      content: parentReplyId ? '二级回复' : '一级回复',
      postId,
      authorId: new Types.ObjectId().toString(),
      authorOwnerUserIdSnapshot: new Types.ObjectId().toString(),
      parentReplyId,
      circleRulesVersion: 1,
    });
  }

  async function recordCreated(reply: Reply): Promise<void> {
    await connection.transaction((session) => service.recordReplyCreated(reply, session));
  }

  async function setVisibility(replyId: string, visible: boolean): Promise<void> {
    await connection.transaction(async (session) => {
      const reply = await replyModel.findOne(
        { _id: replyId, deletedAt: { $exists: true } },
        'postId parentReplyId childReplyCount',
        { session },
      );
      if (!reply) throw new Error('测试回复不存在');
      await replyModel.updateOne(
        { _id: replyId },
        { $set: { deletedAt: visible ? null : new Date() } },
        { session },
      );
      await service.recordReplyVisibilityChanged(reply, visible, session);
    });
  }

  it('keeps post and root counters aligned when replies are created', async () => {
    const post = await createPost();
    const root = await createReply(post.id, null);
    await recordCreated(root);
    const child = await createReply(post.id, root.id);
    await recordCreated(child);

    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ replyCount: 2 });
    await expect(replyModel.findById(root.id).lean()).resolves.toMatchObject({
      childReplyCount: 1,
    });
  });

  it('counts only children whose root branch is currently visible', async () => {
    const post = await createPost();
    const root = await createReply(post.id, null);
    await recordCreated(root);
    const firstChild = await createReply(post.id, root.id);
    await recordCreated(firstChild);
    const secondChild = await createReply(post.id, root.id);
    await recordCreated(secondChild);

    await setVisibility(root.id, false);
    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ replyCount: 0 });

    await setVisibility(firstChild.id, false);
    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ replyCount: 0 });
    await expect(
      replyModel.findOne({ _id: root.id, deletedAt: { $exists: true } }).lean(),
    ).resolves.toMatchObject({ childReplyCount: 1 });

    await setVisibility(root.id, true);
    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ replyCount: 2 });

    await setVisibility(secondChild.id, false);
    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ replyCount: 1 });
  });

  it('rejects a decrement that would make a persisted counter negative', async () => {
    const post = await createPost();
    const root = await createReply(post.id, null);
    await replyModel.updateOne({ _id: root.id }, { $set: { childReplyCount: 2 } });

    await expect(setVisibility(root.id, false)).rejects.toThrow('帖子回复计数状态不一致');
    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ replyCount: 0 });
  });
});
