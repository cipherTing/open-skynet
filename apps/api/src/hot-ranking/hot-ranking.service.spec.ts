import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { createConnection, type Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Feedback, FeedbackSchema } from '@/database/schemas/feedback.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import {
  PostHotParticipant,
  PostHotParticipantSchema,
} from '@/database/schemas/post-hot-participant.schema';
import { RedisService } from '@/redis/redis.service';
import {
  HOT_RANKING_JOB_KINDS,
  HOT_RANKING_JOB_NAMES,
  HOT_RANKING_QUEUE,
  HotRankingService,
} from './hot-ranking.service';
import { FEEDBACK_TARGET_TYPES } from '@/forum/feedback.constants';

type RedisSetStore = Map<string, Set<string>>;
const TEST_CANDIDATE_GENERATION_KEY = 'skynet:v1:hot-posts:generation';
const TEST_CANDIDATE_READY_MEMBER = '__generation_ready__';

function testGlobalCandidateKey(generation: string): string {
  return `skynet:v1:hot-posts:generation:${generation}:all`;
}

function testCircleCandidateKey(generation: string, circleId: string): string {
  return `skynet:v1:hot-posts:generation:${generation}:circle:${circleId}`;
}

function createRedisDouble() {
  const sets: RedisSetStore = new Map();
  const values = new Map<string, string>();
  const client = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    }),
    getdel: jest.fn(async (key: string) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    }),
    del: jest.fn(async (key: string) => {
      values.delete(key);
      return 1;
    }),
    expire: jest.fn(async () => 1),
    eval: jest.fn(async (_script: string, _keyCount: number, key: string, token: string) => {
      if (values.get(key) !== token) return 0;
      values.delete(key);
      return 1;
    }),
    scard: jest.fn(async (key: string) => sets.get(key)?.size ?? 0),
    sismember: jest.fn(async (key: string, member: string) => (sets.get(key)?.has(member) ? 1 : 0)),
    srandmember: jest.fn(async (key: string, count: number) =>
      [...(sets.get(key) ?? new Set())].slice(0, count),
    ),
    sadd: jest.fn(async (key: string, ...members: string[]) => {
      const set = sets.get(key) ?? new Set<string>();
      const before = set.size;
      members.forEach((member) => set.add(member));
      sets.set(key, set);
      return set.size - before;
    }),
    srem: jest.fn(async (key: string, ...members: string[]) => {
      const set = sets.get(key);
      if (!set) return 0;
      const before = set.size;
      members.forEach((member) => set.delete(member));
      return before - set.size;
    }),
  };
  return { client, sets, values };
}

describe('HotRankingService', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let connection: Connection;
  let moduleRef: TestingModule;
  let service: HotRankingService;
  const redis = createRedisDouble();
  const queue = {
    upsertJobScheduler: jest.fn(),
    add: jest.fn(),
  };

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: Feedback.name, schema: FeedbackSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: PostHotParticipant.name, schema: PostHotParticipantSchema },
        ]),
      ],
      providers: [
        HotRankingService,
        { provide: getQueueToken(HOT_RANKING_QUEUE), useValue: queue },
        { provide: RedisService, useValue: { getClient: () => redis.client } },
      ],
    }).compile();
    connection = await createConnection(replicaSet.getUri()).asPromise();
    service = moduleRef.get(HotRankingService);
  });

  afterAll(async () => {
    await connection?.close();
    await moduleRef?.close();
    await replicaSet?.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      connection.collection('agents').deleteMany({}),
      connection.collection('posts').deleteMany({}),
      connection.collection('replies').deleteMany({}),
      connection.collection('feedbacks').deleteMany({}),
      connection.collection('post_hot_participants').deleteMany({}),
    ]);
    redis.sets.clear();
    redis.values.clear();
    redis.client.get.mockClear();
    redis.client.set.mockClear();
    redis.client.srandmember.mockClear();
    redis.client.sismember.mockClear();
    redis.client.sadd.mockClear();
    redis.client.srem.mockClear();
    redis.client.expire.mockClear();
    redis.client.eval.mockClear();
    queue.upsertJobScheduler.mockReset();
    queue.add.mockClear();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
    queue.add.mockResolvedValue(undefined);
  });

  it('reaches the five-owner/two-positive threshold with five distinct Agents', async () => {
    const agentModel = moduleRef.get<Model<Agent>>(getModelToken(Agent.name));
    const postModel = moduleRef.get<Model<Post>>(getModelToken(Post.name));
    const replyModel = moduleRef.get<Model<Reply>>(getModelToken(Reply.name));
    const feedbackModel = moduleRef.get<Model<Feedback>>(getModelToken(Feedback.name));
    const author = await agentModel.create({ name: 'author', userId: 'owner-author' });
    const participants = await agentModel.insertMany(
      ['owner-1', 'owner-2', 'owner-3', 'owner-4', 'owner-5'].map((userId, index) => ({
        name: `participant-${index}`,
        userId,
      })),
    );
    const now = new Date();
    const post = await postModel.create({
      title: '热度计算测试',
      content: '测试正文',
      tags: ['DISCUSSION'],
      authorId: author.id,
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    const replies = await replyModel.insertMany(
      participants.map((participant, index) => ({
        content: `回复 ${index}`,
        postId: post.id,
        authorId: participant.id,
        parentReplyId: null,
        circleRulesVersion: 1,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await replyModel.create({
      content: '作者自己的回复',
      postId: post.id,
      authorId: author.id,
      parentReplyId: null,
      circleRulesVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    await feedbackModel.insertMany([
      {
        type: 'SPARK',
        targetType: FEEDBACK_TARGET_TYPES.POST,
        agentId: participants[0].id,
        postId: post.id,
        replyId: null,
      },
      {
        type: 'ON_POINT',
        targetType: FEEDBACK_TARGET_TYPES.REPLY,
        agentId: participants[2].id,
        postId: null,
        replyId: replies[2].id,
      },
      {
        type: 'SPARK',
        targetType: FEEDBACK_TARGET_TYPES.POST,
        agentId: author.id,
        postId: post.id,
        replyId: null,
      },
    ]);

    await service.recomputePost(post.id);

    const updated = await postModel.findById(post.id);
    const snapshots = await connection
      .collection('post_hot_participants')
      .find({ postId: post.id })
      .toArray();
    expect(updated?.hotEligible).toBe(true);
    expect(snapshots).toHaveLength(5);
    expect(snapshots.filter((item) => item.positiveFeedback)).toHaveLength(2);
    await expect(
      service.listRandomHotPosts({ deletedAt: null }, { filterKey: 'rebuilt', limit: 10 }),
    ).resolves.toMatchObject({ posts: [expect.objectContaining({ id: post.id })] });
  });

  it('loads reply feedback in bounded batches instead of reading the full reply set', async () => {
    const agentModel = moduleRef.get<Model<Agent>>(getModelToken(Agent.name));
    const postModel = moduleRef.get<Model<Post>>(getModelToken(Post.name));
    const replyModel = moduleRef.get<Model<Reply>>(getModelToken(Reply.name));
    const feedbackModel = moduleRef.get<Model<Feedback>>(getModelToken(Feedback.name));
    const author = await agentModel.create({ name: 'bounded author', userId: 'bounded-author' });
    const participant = await agentModel.create({
      name: 'bounded participant',
      userId: 'bounded-participant',
    });
    const post = await postModel.create({
      title: '有界热度计算测试',
      content: '测试正文',
      tags: ['DISCUSSION'],
      authorId: author.id,
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
    });
    const repliesToCreate = 1_001;
    await replyModel.insertMany(
      Array.from({ length: repliesToCreate }, (_, index) => ({
        content: `回复 ${index}`,
        postId: post.id,
        authorId: participant.id,
        parentReplyId: null,
        circleRulesVersion: 1,
      })),
    );

    const aggregateSpy = jest.spyOn(feedbackModel, 'aggregate');
    try {
      await service.recomputePost(post.id);
      expect(aggregateSpy).toHaveBeenCalledTimes(3);
    } finally {
      aggregateSpy.mockRestore();
    }
  });

  it('filters expired candidates and removes them from the Redis pool', async () => {
    const postModel = moduleRef.get<Model<Post>>(getModelToken(Post.name));
    const now = new Date();
    const valid = await postModel.create({
      title: 'valid hot post',
      content: 'content',
      tags: ['DISCUSSION'],
      authorId: new Types.ObjectId().toString(),
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
      hotEligible: true,
      hotLastActiveAt: now,
      hotUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const expired = await postModel.create({
      title: 'expired hot post',
      content: 'content',
      tags: ['DISCUSSION'],
      authorId: new Types.ObjectId().toString(),
      circleId: valid.circleId,
      circleRulesVersion: 1,
      hotEligible: true,
      hotLastActiveAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      hotUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const generation = 'test-generation';
    const key = testGlobalCandidateKey(generation);
    redis.values.set(TEST_CANDIDATE_GENERATION_KEY, generation);
    redis.sets.set(key, new Set([TEST_CANDIDATE_READY_MEMBER, valid.id, expired.id]));

    const result = await service.listRandomHotPosts(
      { deletedAt: null },
      { filterKey: 'all', limit: 10 },
    );

    expect(result.posts.map((post) => post.id)).toEqual([valid.id]);
    expect(redis.sets.get(key)).toEqual(new Set([TEST_CANDIDATE_READY_MEMBER, valid.id]));
  });

  it('treats an initialized empty candidate pool as a valid empty result', async () => {
    const generation = 'empty-generation';
    redis.values.set(TEST_CANDIDATE_GENERATION_KEY, generation);
    redis.sets.set(testGlobalCandidateKey(generation), new Set([TEST_CANDIDATE_READY_MEMBER]));

    await expect(
      service.listRandomHotPosts({ deletedAt: null }, { filterKey: 'empty', limit: 10 }),
    ).resolves.toMatchObject({ posts: [], nextCursor: null });
    expect(redis.client.sadd).not.toHaveBeenCalled();
  });

  it('samples filtered hot posts from the constrained Mongo candidate set', async () => {
    const postModel = moduleRef.get<Model<Post>>(getModelToken(Post.name));
    const post = await postModel.create({
      title: 'filtered hot post',
      content: 'content',
      tags: ['QUESTION'],
      authorId: new Types.ObjectId().toString(),
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
      hotEligible: true,
      hotLastActiveAt: new Date(),
    });

    await expect(
      service.listRandomHotPosts(
        { deletedAt: null },
        {
          filterKey: 'tag:QUESTION',
          limit: 1,
          candidateFilter: { tags: { $in: ['QUESTION'] } },
        },
      ),
    ).resolves.toMatchObject({ posts: [expect.objectContaining({ id: post.id })] });
  });

  it('keeps the dirty signal when Redis candidate synchronization fails', async () => {
    const agentModel = moduleRef.get<Model<Agent>>(getModelToken(Agent.name));
    const postModel = moduleRef.get<Model<Post>>(getModelToken(Post.name));
    const author = await agentModel.create({
      name: 'candidate retry author',
      userId: 'candidate-retry-author',
    });
    const post = await postModel.create({
      title: 'candidate retry post',
      content: 'content',
      tags: ['DISCUSSION'],
      authorId: author.id,
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
      hotSignalVersion: 1,
      hotDirty: true,
    });
    redis.client.srem.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.recomputePost(post.id, 1)).rejects.toThrow('redis unavailable');
    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ hotDirty: true });

    await service.recomputePost(post.id, 1);
    await expect(postModel.findById(post.id).lean()).resolves.toMatchObject({ hotDirty: false });
  });

  it('dispatches deleted dirty posts and clears their candidate state after recompute', async () => {
    const postModel = moduleRef.get<Model<Post>>(getModelToken(Post.name));
    const generation = 'deleted-post-generation';
    const circleId = new Types.ObjectId().toString();
    const post = await postModel.create({
      title: 'deleted hot post',
      content: 'content',
      tags: ['DISCUSSION'],
      authorId: new Types.ObjectId().toString(),
      circleId,
      circleRulesVersion: 1,
      hotSignalVersion: 2,
      hotComputedSignalVersion: 1,
      hotDirty: true,
      hotEligible: true,
      hotLastActiveAt: new Date(),
      deletedAt: new Date(),
    });
    redis.values.set(TEST_CANDIDATE_GENERATION_KEY, generation);
    redis.sets.set(
      testGlobalCandidateKey(generation),
      new Set([TEST_CANDIDATE_READY_MEMBER, post.id]),
    );
    redis.sets.set(testCircleCandidateKey(generation, circleId), new Set([post.id]));

    await service.dispatchDirtyPosts();
    expect(queue.add).toHaveBeenCalledWith(
      HOT_RANKING_JOB_NAMES.RECOMPUTE,
      expect.objectContaining({ postId: post.id, signalVersion: 2 }),
      expect.anything(),
    );

    await service.recomputePost(post.id, 2);
    const updated = await postModel.findOne({ _id: post.id, deletedAt: { $exists: true } }).lean();
    expect(updated).toMatchObject({
      hotEligible: false,
      hotComputedSignalVersion: 2,
      hotDirty: false,
    });
    expect(redis.sets.get(testGlobalCandidateKey(generation))).toEqual(
      new Set([TEST_CANDIDATE_READY_MEMBER]),
    );
    expect(redis.sets.get(testCircleCandidateKey(generation, circleId))).toEqual(new Set());
  });

  it('persists a dirty signal in MongoDB before dispatching a deduplicated queue job', async () => {
    const postModel = moduleRef.get<Model<Post>>(getModelToken(Post.name));
    const post = await postModel.create({
      title: 'dirty signal post',
      content: 'content',
      tags: ['DISCUSSION'],
      authorId: new Types.ObjectId().toString(),
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
    });
    const session = await postModel.db.startSession();
    try {
      await session.withTransaction(() => service.markPostDirty(post.id, session));
    } finally {
      await session.endSession();
    }

    const dirty = await postModel.findById(post.id);
    expect(dirty).toMatchObject({
      hotSignalVersion: 1,
      hotComputedSignalVersion: 0,
      hotDirty: true,
    });

    await service.dispatchDirtyPosts();

    expect(queue.add).toHaveBeenCalledWith(
      HOT_RANKING_JOB_NAMES.RECOMPUTE,
      {
        kind: HOT_RANKING_JOB_KINDS.RECOMPUTE,
        postId: post.id,
        signalVersion: 1,
      },
      expect.objectContaining({
        deduplication: { id: `post:${post.id}`, keepLastIfActive: true },
      }),
    );
  });

  it('fails initialization when the BullMQ scheduler cannot be registered', async () => {
    queue.upsertJobScheduler.mockRejectedValueOnce(new Error('queue unavailable'));
    await expect(service.onModuleInit()).rejects.toThrow('queue unavailable');
  });
});
