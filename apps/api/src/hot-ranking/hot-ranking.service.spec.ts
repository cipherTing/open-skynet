import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Feedback, FeedbackSchema } from '@/database/schemas/feedback.schema';
import {
  HotCandidateGeneration,
  HotCandidateGenerationSchema,
  HOT_CANDIDATE_GENERATION_STATUSES,
} from '@/database/schemas/hot-candidate-generation.schema';
import {
  HotProjectionWorkItem,
  HotProjectionWorkItemSchema,
} from '@/database/schemas/hot-projection-work-item.schema';
import {
  HotReplyFeedbackFanout,
  HotReplyFeedbackFanoutSchema,
} from '@/database/schemas/hot-reply-feedback-fanout.schema';
import {
  PostHotParticipant,
  PostHotParticipantSchema,
} from '@/database/schemas/post-hot-participant.schema';
import { PostHotState, PostHotStateSchema } from '@/database/schemas/post-hot-state.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import { DatabaseService } from '@/database/database.service';
import { RedisService } from '@/redis/redis.service';
import { FEEDBACK_TARGET_TYPES } from '@/forum/feedback.constants';
import {
  HOT_CANDIDATE_JOB_KINDS,
  HOT_CANDIDATE_REBUILD_BATCH_SIZE,
  HOT_RANKING_CANDIDATE_QUEUE,
  HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE,
  HOT_RANKING_PROJECTION_QUEUE,
  HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE,
} from '@/hot-ranking/hot-ranking.constants';
import { HotRankingProjectionService } from '@/hot-ranking/hot-ranking-projection.service';
import { HotCandidateIndexService } from '@/hot-ranking/hot-candidate-index.service';
import { HotRankingQueryService } from '@/hot-ranking/hot-ranking-query.service';
import { HotRankingWorkService } from '@/hot-ranking/hot-ranking-work.service';
import { HotRankingScheduler } from '@/hot-ranking/hot-ranking.processor';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';

type RedisSetStore = Map<string, Set<string>>;

function createRedisDouble() {
  const values = new Map<string, string>();
  const sets: RedisSetStore = new Map();
  const hashes = new Map<string, Map<string, string>>();
  const createPipeline = () => {
    const commands: Array<{ key: string; count: number }> = [];
    const pipeline = {
      srandmember: jest.fn((key: string, count: number) => {
        commands.push({ key, count });
      }),
      exec: jest.fn(async () =>
        commands.map(({ key, count }) => [
          null,
          [...(sets.get(key) ?? new Set<string>())].slice(0, count),
        ]),
      ),
    };
    return pipeline;
  };
  const client = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        removed += Number(values.delete(key));
        removed += Number(sets.delete(key));
        removed += Number(hashes.delete(key));
      }
      return removed;
    }),
    unlink: jest.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        removed += Number(values.delete(key));
        removed += Number(sets.delete(key));
        removed += Number(hashes.delete(key));
      }
      return removed;
    }),
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
    scard: jest.fn(async (key: string) => sets.get(key)?.size ?? 0),
    srandmember: jest.fn(async (key: string, count: number) =>
      [...(sets.get(key) ?? new Set<string>())].slice(0, count),
    ),
    pipeline: jest.fn(createPipeline),
    eval: jest.fn(async (_script: string, keyCount: number, ...args: string[]): Promise<number> => {
      if (keyCount === 4 && args.length === 5) {
        const [readyKey, activeKey, buildingKey, buildMarkerKey, generationId] = args;
        if (values.get(buildingKey) !== generationId) return 0;
        values.set(readyKey, '1');
        values.set(activeKey, generationId);
        values.delete(buildingKey);
        values.delete(buildMarkerKey);
        return 1;
      }
      if (keyCount === 1 && args.length === 2) {
        const [pointerKey, generationId] = args;
        if (values.get(pointerKey) !== generationId) return 0;
        values.delete(pointerKey);
        return 1;
      }
      const [metadataKey, globalKey, manifestKey, readyKey, buildMarkerKey] = args;
      const [postId, versionValue, eligibleValue, circleId, circlePrefix, generationId] =
        args.slice(5);
      if (values.get(readyKey) !== '1' && values.get(buildMarkerKey) !== generationId) return -1;
      const metadata = hashes.get(metadataKey) ?? new Map<string, string>();
      const current = metadata.get(postId);
      if (current) {
        const [currentVersionValue, previousCircleId] = current.split('|');
        if (Number(currentVersionValue) > Number(versionValue)) return 0;
        if (previousCircleId !== circleId) {
          sets.get(`${circlePrefix}${previousCircleId}`)?.delete(postId);
        }
      } else if (eligibleValue === '0' && Number(versionValue) === 0) {
        return 0;
      }
      metadata.set(postId, `${versionValue}|${circleId}`);
      hashes.set(metadataKey, metadata);
      const manifest = sets.get(manifestKey) ?? new Set<string>();
      manifest.add(metadataKey);
      manifest.add(globalKey);
      manifest.add(`${circlePrefix}${circleId}`);
      sets.set(manifestKey, manifest);
      const globalSet = sets.get(globalKey) ?? new Set<string>();
      const circleKey = `${circlePrefix}${circleId}`;
      const circleSet = sets.get(circleKey) ?? new Set<string>();
      if (eligibleValue === '1') {
        globalSet.add(postId);
        circleSet.add(postId);
      } else {
        globalSet.delete(postId);
        circleSet.delete(postId);
      }
      sets.set(globalKey, globalSet);
      sets.set(circleKey, circleSet);
      return 1;
    }),
  };
  return { client, values, sets, hashes };
}

describe('Hot ranking projection and candidates', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: HotRankingService;
  let projectionService: HotRankingProjectionService;
  let candidateService: HotCandidateIndexService;
  let scheduler: HotRankingScheduler;
  let postModel: Model<Post>;
  let replyModel: Model<Reply>;
  let feedbackModel: Model<Feedback>;
  let agentModel: Model<Agent>;
  let stateModel: Model<PostHotState>;
  let workItemModel: Model<HotProjectionWorkItem>;
  let participantModel: Model<PostHotParticipant>;
  let generationModel: Model<HotCandidateGeneration>;
  const redis = createRedisDouble();
  const projectionQueue = { add: jest.fn(), upsertJobScheduler: jest.fn() };
  const candidateQueue = { add: jest.fn(), upsertJobScheduler: jest.fn() };
  const candidateMaintenanceQueue = { add: jest.fn(), upsertJobScheduler: jest.fn() };

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
          { name: Circle.name, schema: CircleSchema },
          { name: PostHotState.name, schema: PostHotStateSchema },
          { name: PostHotParticipant.name, schema: PostHotParticipantSchema },
          { name: HotProjectionWorkItem.name, schema: HotProjectionWorkItemSchema },
          { name: HotReplyFeedbackFanout.name, schema: HotReplyFeedbackFanoutSchema },
          { name: HotCandidateGeneration.name, schema: HotCandidateGenerationSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        HotRankingService,
        HotRankingWorkService,
        HotRankingProjectionService,
        HotCandidateIndexService,
        HotRankingQueryService,
        HotRankingScheduler,
        { provide: getQueueToken(HOT_RANKING_PROJECTION_QUEUE), useValue: projectionQueue },
        { provide: getQueueToken(HOT_RANKING_CANDIDATE_QUEUE), useValue: candidateQueue },
        {
          provide: getQueueToken(HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE),
          useValue: candidateMaintenanceQueue,
        },
        { provide: RedisService, useValue: { getClient: () => redis.client } },
      ],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(HotRankingService);
    projectionService = moduleRef.get(HotRankingProjectionService);
    candidateService = moduleRef.get(HotCandidateIndexService);
    scheduler = moduleRef.get(HotRankingScheduler);
    postModel = moduleRef.get(getModelToken(Post.name));
    replyModel = moduleRef.get(getModelToken(Reply.name));
    feedbackModel = moduleRef.get(getModelToken(Feedback.name));
    agentModel = moduleRef.get(getModelToken(Agent.name));
    stateModel = moduleRef.get(getModelToken(PostHotState.name));
    workItemModel = moduleRef.get(getModelToken(HotProjectionWorkItem.name));
    participantModel = moduleRef.get(getModelToken(PostHotParticipant.name));
    generationModel = moduleRef.get(getModelToken(HotCandidateGeneration.name));
  });

  afterAll(async () => {
    await moduleRef?.close();
    await replicaSet?.stop();
  });

  beforeEach(async () => {
    await Promise.all(
      [
        'agents',
        'posts',
        'replies',
        'feedbacks',
        'post_hot_states',
        'post_hot_participants',
        'hot_projection_work_items',
        'hot_reply_feedback_fanouts',
        'hot_candidate_generations',
        'circles',
      ].map((collection) => connection.collection(collection).deleteMany({})),
    );
    redis.values.clear();
    redis.sets.clear();
    redis.hashes.clear();
    jest.clearAllMocks();
    projectionQueue.add.mockResolvedValue(undefined);
    candidateQueue.add.mockResolvedValue(undefined);
    candidateMaintenanceQueue.add.mockResolvedValue(undefined);
  });

  async function createAgent(name: string): Promise<Agent> {
    return agentModel.create({ name, userId: `owner-${name}` });
  }

  async function createReadyGeneration(generationId: string): Promise<void> {
    await generationModel.create({
      generationId,
      status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
      cursorStateId: null,
      version: 1,
      claimedUntil: null,
      activatedAt: new Date(),
    });
    redis.values.set('skynet:v2:hot-posts:active-generation', generationId);
    redis.values.set(`skynet:v2:hot-posts:generation:${generationId}:ready`, '1');
  }

  async function createPost(author: Agent, title = '热度投影测试'): Promise<Post> {
    const circleId = new Types.ObjectId();
    await connection.model(Circle.name).create({
      _id: circleId,
      slug: `hot-${circleId.toString()}`,
      name: `热度测试圈子-${circleId.toString()}`,
      normalizedName: `热度测试圈子-${circleId.toString()}`,
      topic: '热度测试',
      createdByType: 'SYSTEM',
      createdByAgentId: null,
      rules: [],
      topicVersion: 1,
      rulesVersion: 1,
      kind: 'NORMAL',
      status: 'ACTIVE',
      visibilityVersion: 1,
    });
    const post = await postModel.create({
      title,
      content: '正文',
      tags: ['DISCUSSION'],
      authorId: author.id,
      circleId: circleId.toString(),
      circleRulesVersion: 1,
    });
    await connection.transaction((session) => service.initializePost(post.id, session));
    return post;
  }

  async function createReply(post: Post, author: Agent, content: string): Promise<Reply> {
    const reply = await replyModel.create({
      content,
      postId: post.id,
      authorId: author.id,
      authorOwnerUserIdSnapshot: author.userId,
      parentReplyId: null,
      circleRulesVersion: 1,
    });
    await connection.transaction((session) => service.recordReplyCreated(reply.id, session));
    return reply;
  }

  async function createPositiveFeedback(
    post: Post,
    targetReply: Reply,
    agent: Agent,
  ): Promise<Feedback> {
    const feedback = await feedbackModel.create({
      type: 'SPARK',
      targetType: 'REPLY',
      agentId: agent.id,
      agentOwnerUserIdSnapshot: agent.userId,
      postId: null,
      replyId: targetReply.id,
      contextPostId: post.id,
    });
    await connection.transaction((session) =>
      service.recordFeedbackContribution(
        {
          feedbackId: feedback.id,
          postId: post.id,
          agentId: agent.id,
          ownerUserIdSnapshot: agent.userId,
          feedbackType: feedback.type,
          sourceExists: true,
          activityAt: feedback.updatedAt,
          target: { type: FEEDBACK_TARGET_TYPES.REPLY, id: targetReply.id },
        },
        session,
      ),
    );
    return feedback;
  }

  async function drainProjection(postId: string): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const state = await stateModel.findOne({ postId });
      if (!state?.projectionDirty) return;
      await projectionService.projectPost(postId, state.signalVersion);
    }
    throw new Error('热度投影没有在测试上限内清空');
  }

  it('registers only bounded BullMQ schedulers during module initialization', async () => {
    await scheduler.onModuleInit();

    expect(projectionQueue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(candidateQueue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(candidateMaintenanceQueue.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(projectionQueue.upsertJobScheduler.mock.calls[0][1]).toEqual({ every: 1_000 });
    expect(projectionQueue.upsertJobScheduler.mock.calls[1][1]).toEqual({ every: 1_000 });
    expect(projectionQueue.upsertJobScheduler.mock.calls[1][2].opts).toMatchObject({
      attempts: 4,
      priority: 1,
      backoff: { type: 'exponential', delay: 1_000 },
    });
    expect(candidateMaintenanceQueue.upsertJobScheduler.mock.calls[0][1]).toEqual({
      every: 10_000,
    });
    expect(candidateMaintenanceQueue.upsertJobScheduler.mock.calls[0][2].opts).toMatchObject({
      attempts: 4,
      priority: 10,
    });
  });

  it('incrementally reaches the five-owner and two-positive threshold', async () => {
    const author = await createAgent('author');
    const participants = await Promise.all(
      Array.from({ length: 5 }, (_, index) => createAgent(`participant-${index}`)),
    );
    const post = await createPost(author);
    const replies: Reply[] = [];
    for (const [index, participant] of participants.entries()) {
      replies.push(await createReply(post, participant, `回复 ${index}`));
    }
    await createPositiveFeedback(post, replies[0], participants[1]);
    await createPositiveFeedback(post, replies[1], participants[2]);

    await drainProjection(post.id);

    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      participantCount: 5,
      positiveOwnerCount: 2,
      effectiveReplyCount: 5,
      eligible: true,
      projectionDirty: false,
    });
    await expect(participantModel.countDocuments({ postId: post.id })).resolves.toBe(5);

    const version = (await stateModel.findOne({ postId: post.id }).lean())?.signalVersion;
    if (version === undefined) throw new Error('测试热度状态缺失');
    await projectionService.projectPost(post.id, version);
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      participantCount: 5,
      positiveOwnerCount: 2,
      effectiveReplyCount: 5,
    });
  });

  it('excludes the author Owner and does not count a deleted feedback forever', async () => {
    const author = await createAgent('owner-exclusion-author');
    const participant = await createAgent('owner-exclusion-participant');
    const post = await createPost(author);
    const ownReply = await createReply(post, author, '作者自己的回复');
    const foreignReply = await createReply(post, participant, '其他人的回复');
    const feedback = await createPositiveFeedback(post, foreignReply, participant);
    await drainProjection(post.id);

    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      participantCount: 1,
      effectiveReplyCount: 1,
    });
    await expect(workItemModel.findOne({ sourceId: ownReply.id })).resolves.toBeNull();

    await connection.transaction(async (session) => {
      await feedbackModel.deleteOne({ _id: feedback.id }, { session });
      await service.recordFeedbackContribution(
        {
          feedbackId: feedback.id,
          postId: post.id,
          agentId: participant.id,
          ownerUserIdSnapshot: participant.userId,
          feedbackType: null,
          sourceExists: false,
          activityAt: feedback.updatedAt,
          target: { type: FEEDBACK_TARGET_TYPES.REPLY, id: foreignReply.id },
        },
        session,
      );
    });
    await drainProjection(post.id);
    await expect(workItemModel.findOne({ sourceId: feedback.id })).resolves.toBeNull();
  });

  it('does not create a hot work item for negative feedback', async () => {
    const author = await createAgent('negative-author');
    const participant = await createAgent('negative-participant');
    const post = await createPost(author);
    const reply = await createReply(post, participant, '负向评价目标');
    const feedback = await feedbackModel.create({
      type: 'OFF_TOPIC',
      targetType: 'REPLY',
      agentId: participant.id,
      agentOwnerUserIdSnapshot: participant.userId,
      postId: null,
      replyId: reply.id,
      contextPostId: post.id,
    });
    await connection.transaction((session) =>
      service.recordFeedbackContribution(
        {
          feedbackId: feedback.id,
          postId: post.id,
          agentId: participant.id,
          ownerUserIdSnapshot: participant.userId,
          feedbackType: feedback.type,
          sourceExists: true,
          activityAt: feedback.updatedAt,
          target: { type: FEEDBACK_TARGET_TYPES.REPLY, id: reply.id },
        },
        session,
      ),
    );
    const beforeRepeat = await stateModel.findOne({ postId: post.id }).lean();
    if (!beforeRepeat) throw new Error('测试热度状态缺失');
    await connection.transaction((session) =>
      service.recordFeedbackContribution(
        {
          feedbackId: feedback.id,
          postId: post.id,
          agentId: participant.id,
          ownerUserIdSnapshot: participant.userId,
          feedbackType: feedback.type,
          sourceExists: true,
          activityAt: feedback.updatedAt,
          target: { type: FEEDBACK_TARGET_TYPES.REPLY, id: reply.id },
        },
        session,
      ),
    );
    await drainProjection(post.id);
    await expect(workItemModel.findOne({ sourceId: feedback.id })).resolves.toBeNull();
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      signalVersion: beforeRepeat.signalVersion,
      projectionDirty: false,
    });
  });

  it('rejects reply events when the post hot state was not initialized', async () => {
    const author = await createAgent('missing-state-author');
    const participant = await createAgent('missing-state-participant');
    const post = await postModel.create({
      title: '没有状态的帖子',
      content: '正文',
      tags: ['DISCUSSION'],
      authorId: author.id,
      circleId: new Types.ObjectId().toString(),
      circleRulesVersion: 1,
    });
    const reply = await replyModel.create({
      content: '回复',
      postId: post.id,
      authorId: participant.id,
      authorOwnerUserIdSnapshot: participant.userId,
      parentReplyId: null,
      circleRulesVersion: 1,
    });

    await expect(
      connection.transaction((session) => service.recordReplyCreated(reply.id, session)),
    ).rejects.toThrow('帖子热度状态不存在');
    await expect(stateModel.exists({ postId: post.id })).resolves.toBeNull();
  });

  it('does not clear a newer signal that arrives during projection finalization', async () => {
    const author = await createAgent('race-author');
    const firstParticipant = await createAgent('race-first');
    const secondParticipant = await createAgent('race-second');
    const post = await createPost(author);
    await createReply(post, firstParticipant, '第一条回复');
    const dispatchedState = await stateModel.findOne({ postId: post.id });
    if (!dispatchedState) throw new Error('测试热度状态缺失');

    await createReply(post, secondParticipant, '并发到达的回复');
    await projectionService.projectPost(post.id, dispatchedState.signalVersion);

    const afterFirstPass = await stateModel.findOne({ postId: post.id });
    expect(afterFirstPass).toMatchObject({ projectionDirty: true });
    await drainProjection(post.id);
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      participantCount: 2,
      effectiveReplyCount: 2,
      projectionDirty: false,
    });
  });

  it('releases a projection dispatch claim when BullMQ publication fails', async () => {
    const author = await createAgent('projection-publish-failure-author');
    const participant = await createAgent('projection-publish-failure-participant');
    const post = await createPost(author);
    await createReply(post, participant, '派发失败后仍需处理');
    projectionQueue.add.mockRejectedValueOnce(new Error('projection queue unavailable'));

    await expect(projectionService.dispatchDirtyPosts()).rejects.toThrow(
      'projection queue unavailable',
    );
    const state = await stateModel.findOne({ postId: post.id });
    expect(state?.projectionDirty).toBe(true);
    expect(state?.projectionClaimedUntil).toBeNull();
    expect(state?.projectionDispatchAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('fans out reply feedback in bounded batches and hides dirty posts immediately', async () => {
    const author = await createAgent('fanout-author');
    const replyAuthor = await createAgent('fanout-reply-author');
    const voters = await Promise.all(
      Array.from({ length: HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE + 5 }, (_, index) =>
        createAgent(`fanout-voter-${index}`),
      ),
    );
    const post = await createPost(author);
    const reply = await createReply(post, replyAuthor, '将被隐藏的回复');
    for (const voter of voters) await createPositiveFeedback(post, reply, voter);
    await drainProjection(post.id);

    await connection.transaction(async (session) => {
      await replyModel.updateOne(
        { _id: reply.id },
        { $set: { deletedAt: new Date() } },
        { session },
      );
      await service.recordReplyVisibilityChanged(reply.id, session);
    });
    await expect(service.getHotPostIds([post.id])).resolves.toEqual(new Set());

    const beforeFirstPass = await workItemModel.countDocuments({ postId: post.id });
    const state = await stateModel.findOne({ postId: post.id });
    if (!state) throw new Error('测试热度状态缺失');
    await projectionService.projectPost(post.id, state.signalVersion);
    const afterFirstPass = await workItemModel.countDocuments({ postId: post.id });
    expect(afterFirstPass - beforeFirstPass).toBeLessThanOrEqual(
      HOT_REPLY_FEEDBACK_FANOUT_BATCH_SIZE,
    );
    await drainProjection(post.id);
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      effectiveReplyCount: 0,
      positiveOwnerCount: 0,
      eligible: false,
      projectionDirty: false,
    });
  });

  it('converges to the latest reply visibility after delete and restore races', async () => {
    const author = await createAgent('visibility-race-author');
    const replyAuthor = await createAgent('visibility-race-reply-author');
    const voter = await createAgent('visibility-race-voter');
    const post = await createPost(author);
    const reply = await createReply(post, replyAuthor, '可见性乱序目标');
    await createPositiveFeedback(post, reply, voter);
    await drainProjection(post.id);

    const setReplyVisibility = async (deletedAt: Date | null) => {
      await connection.transaction(async (session) => {
        await replyModel.updateOne({ _id: reply.id }, { $set: { deletedAt } }, { session });
        await service.recordReplyVisibilityChanged(reply.id, session);
      });
    };

    await setReplyVisibility(new Date());
    await setReplyVisibility(null);
    await drainProjection(post.id);
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      participantCount: 2,
      positiveOwnerCount: 1,
      effectiveReplyCount: 1,
      projectionDirty: false,
    });

    await setReplyVisibility(new Date());
    await drainProjection(post.id);
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      participantCount: 0,
      positiveOwnerCount: 0,
      effectiveReplyCount: 0,
      projectionDirty: false,
    });
  });

  it('derives feedback target visibility from MongoDB inside the transaction', async () => {
    const author = await createAgent('target-visibility-author');
    const replyAuthor = await createAgent('target-visibility-reply-author');
    const voter = await createAgent('target-visibility-voter');
    const post = await createPost(author);
    const reply = await createReply(post, replyAuthor, '已删除评价目标');
    await replyModel.updateOne({ _id: reply.id }, { $set: { deletedAt: new Date() } });
    const feedbackId = new Types.ObjectId().toString();

    await connection.transaction((session) =>
      service.recordFeedbackContribution(
        {
          feedbackId,
          postId: post.id,
          agentId: voter.id,
          ownerUserIdSnapshot: voter.userId,
          feedbackType: 'SPARK',
          sourceExists: true,
          activityAt: new Date(),
          target: { type: FEEDBACK_TARGET_TYPES.REPLY, id: reply.id },
        },
        session,
      ),
    );

    await expect(workItemModel.findOne({ sourceId: feedbackId })).resolves.toBeNull();
  });

  it('returns an empty hot feed without rebuilding when no generation is ready', async () => {
    const stateFindSpy = jest.spyOn(stateModel, 'find');
    await expect(
      service.listRandomHotPosts({ deletedAt: null }, { filterKey: 'empty', limit: 20 }),
    ).resolves.toMatchObject({ posts: [], nextCursor: null });
    expect(candidateQueue.add).not.toHaveBeenCalled();
    expect(stateFindSpy).not.toHaveBeenCalled();
    stateFindSpy.mockRestore();
  });

  it('rejects a Redis active pointer without its ready marker on the query path', async () => {
    const generationId = 'query-missing-ready-marker';
    redis.values.set('skynet:v2:hot-posts:active-generation', generationId);

    await expect(
      service.listRandomHotPosts({ deletedAt: null }, { filterKey: 'missing-ready', limit: 20 }),
    ).rejects.toThrow(`活跃代际缺少 Redis 就绪标记 ${generationId}`);
  });

  it('rejects an active Mongo generation without a Redis pointer on the query path', async () => {
    await generationModel.create({
      generationId: 'query-missing-active-pointer',
      status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
      cursorStateId: null,
      version: 1,
      claimedUntil: null,
      activatedAt: new Date(),
    });

    await expect(
      service.listRandomHotPosts({ deletedAt: null }, { filterKey: 'missing-pointer', limit: 20 }),
    ).rejects.toThrow('活跃代际缺少 Redis 指针');
  });

  it('does not store Redis metadata for a post that has never been hot', async () => {
    const author = await createAgent('never-hot-author');
    const post = await createPost(author);
    await stateModel.updateOne(
      { postId: post.id },
      {
        $set: {
          candidateDirty: true,
          candidateDispatchAt: null,
          candidateClaimedUntil: null,
        },
      },
    );
    const generationId = 'never-hot-generation';
    await createReadyGeneration(generationId);

    await candidateService.syncCandidate(post.id);

    expect(
      redis.hashes.get(`skynet:v2:hot-posts:generation:${generationId}:members`)?.has(post.id) ??
        false,
    ).toBe(false);
  });

  it('bounds MongoDB candidate filtering to four rounds per hot-feed request', async () => {
    const generationId = 'bounded-query-generation';
    redis.values.set('skynet:v2:hot-posts:active-generation', generationId);
    redis.values.set(`skynet:v2:hot-posts:generation:${generationId}:ready`, '1');
    redis.sets.set(
      `skynet:v2:hot-posts:generation:${generationId}:all`,
      new Set(Array.from({ length: 1_000 }, () => new Types.ObjectId().toString())),
    );
    const stateFindSpy = jest.spyOn(stateModel, 'find');
    const postFindSpy = jest.spyOn(postModel, 'find');

    await expect(
      service.listRandomHotPosts({ deletedAt: null }, { filterKey: 'bounded', limit: 20 }),
    ).resolves.toMatchObject({ posts: [] });

    expect(stateFindSpy).toHaveBeenCalledTimes(4);
    expect(postFindSpy).toHaveBeenCalledTimes(4);
    stateFindSpy.mockRestore();
    postFindSpy.mockRestore();
  });

  it('reads multiple circle candidate sets through one Redis pipeline', async () => {
    const author = await createAgent('circle-pipeline-author');
    const firstPost = await createPost(author, '圈子候选一');
    const secondPost = await createPost(author, '圈子候选二');
    const generationId = 'circle-pipeline-generation';
    redis.values.set('skynet:v2:hot-posts:active-generation', generationId);
    redis.values.set(`skynet:v2:hot-posts:generation:${generationId}:ready`, '1');
    for (const post of [firstPost, secondPost]) {
      await stateModel.updateOne(
        { postId: post.id },
        {
          $set: {
            eligible: true,
            expiresAt: new Date(Date.now() + 60_000),
            projectionDirty: false,
          },
        },
      );
      redis.sets.set(
        `skynet:v2:hot-posts:generation:${generationId}:circle:${post.circleId}`,
        new Set([post.id]),
      );
    }

    const result = await service.getCirclesHotPosts([firstPost.circleId, secondPost.circleId]);

    expect(redis.client.pipeline).toHaveBeenCalledTimes(1);
    expect(result.get(firstPost.circleId)).toEqual([
      expect.objectContaining({ id: firstPost.id, title: firstPost.title }),
    ]);
    expect(result.get(secondPost.circleId)).toEqual([
      expect.objectContaining({ id: secondPost.id, title: secondPost.title }),
    ]);
  });

  it('never lets an older candidate version remove a newer member', async () => {
    const author = await createAgent('candidate-version-author');
    const participant = await createAgent('candidate-version-participant');
    const post = await createPost(author);
    await createReply(post, participant, '让帖子达到候选状态');
    const state = await stateModel.findOne({ postId: post.id });
    if (!state) throw new Error('测试热度状态缺失');
    await stateModel.updateOne(
      { _id: state._id },
      {
        $set: {
          eligible: true,
          expiresAt: new Date(Date.now() + 60_000),
          candidateVersion: 2,
          candidateDirty: true,
          projectionDirty: false,
        },
      },
    );
    await createReadyGeneration('candidate-version-generation');
    await candidateService.syncCandidate(post.id);
    await stateModel.updateOne(
      { _id: state._id },
      {
        $set: {
          eligible: false,
          expiresAt: null,
          candidateVersion: 1,
          candidateDirty: true,
          candidateSyncedVersion: 0,
        },
      },
    );
    await candidateService.syncCandidate(post.id);
    expect(
      redis.sets.get('skynet:v2:hot-posts:generation:candidate-version-generation:all'),
    ).toContain(post.id);
  });

  it('limits candidate dispatch to one bounded batch', async () => {
    const author = await createAgent('candidate-dispatch-author');
    const states = Array.from({ length: 25 }, (_, index) => ({
      postId: new Types.ObjectId().toString(),
      circleId: new Types.ObjectId().toString(),
      authorAgentId: author.id,
      authorOwnerUserId: author.userId,
      postCreatedAt: new Date(),
      postVisible: true,
      participantCount: 0,
      positiveOwnerCount: 0,
      effectiveReplyCount: 0,
      score: 0,
      lastActiveAt: new Date(),
      eligible: false,
      expiresAt: null,
      signalVersion: index + 1,
      projectionVersion: 0,
      projectionDirty: false,
      candidateVersion: 1,
      candidateSyncedVersion: 0,
      candidateDirty: true,
      candidateDispatchAt: null,
      candidateClaimedUntil: null,
      candidateDispatchAttempts: 0,
    }));
    await stateModel.insertMany(states);
    await createReadyGeneration('dispatch-generation');
    await candidateService.dispatchDirtyCandidates();
    expect(candidateQueue.add).toHaveBeenCalledTimes(20);
  });

  it('rejects candidate dispatch when the active Redis generation is not ready', async () => {
    const generationId = 'dispatch-missing-ready-marker';
    redis.values.set('skynet:v2:hot-posts:active-generation', generationId);

    await expect(candidateService.dispatchDirtyCandidates()).rejects.toThrow(
      `活跃代际缺少 Redis 就绪标记 ${generationId}`,
    );
    expect(candidateQueue.add).not.toHaveBeenCalled();
  });

  it('rejects candidate sync when Mongo has an active generation without Redis pointers', async () => {
    const author = await createAgent('sync-missing-pointer-author');
    const post = await createPost(author);
    await stateModel.updateOne(
      { postId: post.id },
      { $set: { candidateDirty: true, candidateVersion: 1 } },
    );
    await generationModel.create({
      generationId: 'sync-missing-pointer-generation',
      status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
      cursorStateId: null,
      version: 1,
      claimedUntil: null,
      activatedAt: new Date(),
    });

    await expect(candidateService.syncCandidate(post.id)).rejects.toThrow(
      '活跃代际缺少 Redis 指针',
    );
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      candidateDirty: true,
      candidateSyncedVersion: 0,
    });
  });

  it('releases a candidate dispatch claim when BullMQ publication fails', async () => {
    const author = await createAgent('candidate-publish-failure-author');
    const post = await createPost(author);
    await stateModel.updateOne(
      { postId: post.id },
      {
        $set: {
          candidateVersion: 1,
          candidateDirty: true,
          candidateDispatchAt: null,
          candidateClaimedUntil: null,
        },
      },
    );
    const generationId = 'candidate-publish-failure-generation';
    await createReadyGeneration(generationId);
    candidateQueue.add.mockRejectedValueOnce(new Error('candidate queue unavailable'));

    await expect(candidateService.dispatchDirtyCandidates()).rejects.toThrow(
      'candidate queue unavailable',
    );
    const state = await stateModel.findOne({ postId: post.id });
    expect(state?.candidateDirty).toBe(true);
    expect(state?.candidateClaimedUntil).toBeNull();
    expect(state?.candidateDispatchAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('expires a stale hot post and allows a new interaction to re-enter it', async () => {
    const author = await createAgent('expiry-author');
    const participants = await Promise.all(
      Array.from({ length: 5 }, (_, index) => createAgent(`expiry-participant-${index}`)),
    );
    const post = await createPost(author);
    const replies = [];
    for (const participant of participants)
      replies.push(await createReply(post, participant, '活跃回复'));
    await createPositiveFeedback(post, replies[0], participants[1]);
    await createPositiveFeedback(post, replies[1], participants[2]);
    await drainProjection(post.id);
    const staleAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await workItemModel.updateMany(
      { postId: post.id, projectedActive: true },
      { $set: { projectedActivityAt: staleAt } },
    );
    await participantModel.updateMany(
      { postId: post.id },
      { $set: { lastActiveAt: staleAt, lastReplyAt: staleAt, lastPositiveFeedbackAt: staleAt } },
    );
    await stateModel.updateOne(
      { postId: post.id },
      {
        $set: {
          lastActiveAt: staleAt,
          expiresAt: new Date(Date.now() - 1_000),
        },
      },
    );
    await projectionService.expireDueStates();
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      eligible: false,
    });
    await createReply(post, participants[0], '重新活跃');
    await drainProjection(post.id);
    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      eligible: true,
    });
  });

  it('rolls back a business transaction without leaving a hot work item', async () => {
    const author = await createAgent('rollback-author');
    const participant = await createAgent('rollback-participant');
    const post = await createPost(author);
    const reply = await replyModel.create({
      content: '事务回滚回复',
      postId: post.id,
      authorId: participant.id,
      authorOwnerUserIdSnapshot: participant.userId,
      parentReplyId: null,
      circleRulesVersion: 1,
    });
    await expect(
      connection.transaction(async (session) => {
        await service.recordReplyCreated(reply.id, session);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await expect(workItemModel.findOne({ sourceId: reply.id })).resolves.toBeNull();
  });

  it('rebuilds at most the configured number of states per BullMQ job', async () => {
    const author = await createAgent('rebuild-author');
    const circleId = new Types.ObjectId().toString();
    await stateModel.insertMany(
      Array.from({ length: HOT_CANDIDATE_REBUILD_BATCH_SIZE + 1 }, (_, index) => ({
        postId: new Types.ObjectId().toString(),
        circleId,
        authorAgentId: author.id,
        authorOwnerUserId: author.userId,
        postCreatedAt: new Date(),
        postVisible: true,
        participantCount: 5,
        positiveOwnerCount: 2,
        effectiveReplyCount: 5,
        score: 1,
        lastActiveAt: new Date(),
        eligible: true,
        expiresAt: new Date(Date.now() + 60_000),
        signalVersion: index,
        projectionVersion: index,
        projectionDirty: false,
        candidateVersion: 1,
        candidateSyncedVersion: 0,
        candidateDirty: true,
      })),
    );
    await candidateService.ensureCandidateGeneration();
    const rebuildCall = candidateMaintenanceQueue.add.mock.calls.find(
      ([, data]) => data.kind === HOT_CANDIDATE_JOB_KINDS.REBUILD_BATCH,
    );
    if (!rebuildCall) throw new Error('未创建候选重建任务');
    const data = rebuildCall[1] as {
      generationId: string;
      generationVersion: number;
    };
    redis.client.eval.mockClear();
    await candidateService.rebuildCandidateBatch(data.generationId, data.generationVersion);
    expect(redis.client.eval).toHaveBeenCalledTimes(HOT_CANDIDATE_REBUILD_BATCH_SIZE);
    await expect(
      generationModel.findOne({ generationId: data.generationId }).lean(),
    ).resolves.toMatchObject({
      status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
      version: data.generationVersion + 1,
    });
  });

  it('keeps a rebuild batch bounded when expired eligible states lead the cursor', async () => {
    const author = await createAgent('expired-rebuild-author');
    const circleId = new Types.ObjectId().toString();
    await stateModel.insertMany(
      Array.from({ length: HOT_CANDIDATE_REBUILD_BATCH_SIZE + 1 }, (_, index) => ({
        postId: new Types.ObjectId().toString(),
        circleId,
        authorAgentId: author.id,
        authorOwnerUserId: author.userId,
        postCreatedAt: new Date(),
        postVisible: true,
        participantCount: 5,
        positiveOwnerCount: 2,
        effectiveReplyCount: 5,
        score: 1,
        lastActiveAt: new Date(Date.now() - 60_000),
        eligible: true,
        expiresAt: new Date(Date.now() - 1_000),
        signalVersion: index,
        projectionVersion: index,
        projectionDirty: false,
        candidateVersion: 1,
        candidateSyncedVersion: 0,
        candidateDirty: true,
      })),
    );
    await candidateService.ensureCandidateGeneration();
    const rebuildCall = candidateMaintenanceQueue.add.mock.calls.find(
      ([, data]) => data.kind === HOT_CANDIDATE_JOB_KINDS.REBUILD_BATCH,
    );
    if (!rebuildCall) throw new Error('未创建过期候选重建任务');
    const data = rebuildCall[1] as {
      generationId: string;
      generationVersion: number;
    };

    redis.client.eval.mockClear();
    await candidateService.rebuildCandidateBatch(data.generationId, data.generationVersion);

    expect(redis.client.eval).toHaveBeenCalledTimes(HOT_CANDIDATE_REBUILD_BATCH_SIZE);
    expect(
      redis.sets.get(`skynet:v2:hot-posts:generation:${data.generationId}:all`)?.size ?? 0,
    ).toBe(0);
    await expect(
      generationModel.findOne({ generationId: data.generationId }).lean(),
    ).resolves.toMatchObject({
      status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
      version: data.generationVersion + 1,
    });
  });

  it('synchronizes dirty candidates into a building generation before it is ready', async () => {
    const author = await createAgent('building-sync-author');
    const participant = await createAgent('building-sync-participant');
    const post = await createPost(author, '构建中的候选同步');
    await createReply(post, participant, '让候选状态进入构建代');
    const state = await stateModel.findOne({ postId: post.id });
    if (!state) throw new Error('测试热度状态缺失');
    await stateModel.updateOne(
      { _id: state._id },
      {
        $set: {
          eligible: true,
          expiresAt: new Date(Date.now() + 60_000),
          candidateVersion: 3,
          candidateDirty: true,
          candidateSyncedVersion: 0,
          projectionDirty: false,
        },
      },
    );
    const generationId = 'building-only-generation';
    await generationModel.create({
      generationId,
      status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
      cursorStateId: post.id,
      version: 1,
      claimedUntil: null,
      activatedAt: null,
    });
    redis.values.set('skynet:v2:hot-posts:building-generation', generationId);
    redis.values.set(`skynet:v2:hot-posts:generation:${generationId}:building`, generationId);

    await candidateService.dispatchDirtyCandidates();
    expect(candidateQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ postId: post.id }),
      expect.any(Object),
    );
    await candidateService.syncCandidate(post.id);

    expect(redis.sets.get(`skynet:v2:hot-posts:generation:${generationId}:all`)).toContain(post.id);
  });

  it('cleans a superseded generation in bounded continuation batches', async () => {
    const generationId = 'large-cleanup-generation';
    const manifestKey = `skynet:v2:hot-posts:generation:${generationId}:manifest`;
    const keys = Array.from({ length: 205 }, (_, index) => `cleanup-key-${index}`);
    await generationModel.create({
      generationId,
      status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED,
      cursorStateId: null,
      version: 1,
      claimedUntil: null,
      activatedAt: null,
    });
    redis.sets.set(manifestKey, new Set(keys));
    keys.forEach((key) => redis.values.set(key, '1'));

    await candidateService.cleanupGeneration(generationId, 1);
    await candidateService.cleanupGeneration(generationId, 2);

    await expect(generationModel.findOne({ generationId })).resolves.toBeNull();
    expect(redis.client.srandmember).toHaveBeenNthCalledWith(1, manifestKey, expect.any(Number));
    expect(redis.client.srandmember.mock.calls[0][1]).toBeLessThanOrEqual(200);
    expect(candidateMaintenanceQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ generationId, generationVersion: 2 }),
      expect.objectContaining({ jobId: `hot-cleanup-${generationId}-2` }),
    );
  });

  it('keeps an eligible post in a rebuilt generation while its projection is dirty', async () => {
    const author = await createAgent('dirty-rebuild-author');
    const post = await createPost(author, '重建期间仍在投影的热帖');
    await stateModel.updateOne(
      { postId: post.id },
      {
        $set: {
          participantCount: 5,
          positiveOwnerCount: 2,
          effectiveReplyCount: 5,
          eligible: true,
          expiresAt: new Date(Date.now() + 60_000),
          projectionDirty: true,
          candidateVersion: 1,
          candidateSyncedVersion: 1,
          candidateDirty: false,
        },
      },
    );

    await candidateService.ensureCandidateGeneration();
    const rebuildCall = candidateMaintenanceQueue.add.mock.calls.find(
      ([, data]) => data.kind === HOT_CANDIDATE_JOB_KINDS.REBUILD_BATCH,
    );
    if (!rebuildCall) throw new Error('未创建候选重建任务');
    const data = rebuildCall[1] as {
      generationId: string;
      generationVersion: number;
    };

    await candidateService.rebuildCandidateBatch(data.generationId, data.generationVersion);

    expect(redis.sets.get(`skynet:v2:hot-posts:generation:${data.generationId}:all`)).toContain(
      post.id,
    );
    await expect(service.getHotPostIds([post.id])).resolves.toEqual(new Set());
  });

  it('advances the candidate version when an expired eligible post becomes active again', async () => {
    const author = await createAgent('expired-reactivation-author');
    const participants = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        createAgent(`expired-reactivation-participant-${index}`),
      ),
    );
    const post = await createPost(author, '过期后重新活跃的热帖');
    const replies: Reply[] = [];
    for (const participant of participants) {
      replies.push(await createReply(post, participant, '参与热度'));
    }
    await createPositiveFeedback(post, replies[0], participants[1]);
    await createPositiveFeedback(post, replies[1], participants[2]);
    await drainProjection(post.id);
    const before = await stateModel.findOne({ postId: post.id });
    if (!before) throw new Error('测试热度状态缺失');
    await stateModel.updateOne(
      { _id: before._id },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    );

    await createReply(post, participants[0], '过期检查前到达的新互动');
    await drainProjection(post.id);

    await expect(stateModel.findOne({ postId: post.id }).lean()).resolves.toMatchObject({
      eligible: true,
      candidateVersion: before.candidateVersion + 1,
      candidateDirty: true,
    });
  });

  it('reconciles a Redis-activated generation after a finalize crash', async () => {
    const generationId = 'finalize-crash-generation';
    await generationModel.create({
      generationId,
      status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
      cursorStateId: null,
      version: 1,
      claimedUntil: null,
      activatedAt: null,
    });
    redis.values.set('skynet:v2:hot-posts:active-generation', generationId);
    redis.values.set(`skynet:v2:hot-posts:generation:${generationId}:ready`, '1');

    await candidateService.ensureCandidateGeneration();

    await expect(generationModel.findOne({ generationId }).lean()).resolves.toMatchObject({
      status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
    });
  });

  it('re-enqueues a lost rebuild batch while an older ready generation remains active', async () => {
    const activeGenerationId = 'ready-generation-with-building-recovery';
    const buildingGenerationId = 'lost-rebuild-generation';
    await generationModel.insertMany([
      {
        generationId: activeGenerationId,
        status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
        cursorStateId: null,
        version: 1,
        claimedUntil: null,
        activatedAt: new Date(),
      },
      {
        generationId: buildingGenerationId,
        status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
        cursorStateId: null,
        version: 4,
        claimedUntil: null,
        activatedAt: null,
      },
    ]);
    redis.values.set('skynet:v2:hot-posts:active-generation', activeGenerationId);
    redis.values.set(`skynet:v2:hot-posts:generation:${activeGenerationId}:ready`, '1');
    redis.values.set('skynet:v2:hot-posts:building-generation', buildingGenerationId);
    redis.values.set(
      `skynet:v2:hot-posts:generation:${buildingGenerationId}:building`,
      buildingGenerationId,
    );

    await candidateService.ensureCandidateGeneration();

    expect(candidateMaintenanceQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        kind: HOT_CANDIDATE_JOB_KINDS.REBUILD_BATCH,
        generationId: buildingGenerationId,
        generationVersion: 4,
      }),
      expect.any(Object),
    );
  });

  it('retires and schedules cleanup for obsolete active generations', async () => {
    const activeGenerationId = 'current-active-generation';
    const obsoleteGenerationId = 'obsolete-active-generation';
    await generationModel.insertMany([
      {
        generationId: activeGenerationId,
        status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
        cursorStateId: null,
        version: 1,
        claimedUntil: null,
        activatedAt: new Date(),
      },
      {
        generationId: obsoleteGenerationId,
        status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
        cursorStateId: null,
        version: 1,
        claimedUntil: null,
        activatedAt: new Date(),
      },
    ]);
    redis.values.set('skynet:v2:hot-posts:active-generation', activeGenerationId);
    redis.values.set(`skynet:v2:hot-posts:generation:${activeGenerationId}:ready`, '1');
    redis.values.set(`skynet:v2:hot-posts:generation:${obsoleteGenerationId}:ready`, '1');

    await candidateService.ensureCandidateGeneration();

    await expect(
      generationModel.findOne({ generationId: obsoleteGenerationId }).lean(),
    ).resolves.toMatchObject({ status: HOT_CANDIDATE_GENERATION_STATUSES.SUPERSEDED });
    expect(redis.values.has(`skynet:v2:hot-posts:generation:${obsoleteGenerationId}:ready`)).toBe(
      false,
    );
    expect(candidateMaintenanceQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        kind: HOT_CANDIDATE_JOB_KINDS.CLEANUP_GENERATION,
        generationId: obsoleteGenerationId,
      }),
      expect.any(Object),
    );
  });

  it('rejects a missing Redis build marker instead of silently rebuilding', async () => {
    const stateFindSpy = jest.spyOn(stateModel, 'find');
    await candidateService.ensureCandidateGeneration();
    const first = await generationModel.findOne({
      status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
    });
    if (!first) throw new Error('首个候选代际未创建');
    redis.values.delete(`skynet:v2:hot-posts:generation:${first.generationId}:building`);

    await expect(candidateService.ensureCandidateGeneration()).rejects.toThrow(
      `构建代际缺少 Redis 标记 ${first.generationId}`,
    );

    const generations = await generationModel.find({}).sort({ createdAt: 1 });
    expect(generations).toHaveLength(1);
    expect(generations[0]).toMatchObject({
      generationId: first.generationId,
      status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING,
    });
    expect(stateFindSpy).not.toHaveBeenCalled();
    stateFindSpy.mockRestore();
  });

  it('rejects an active Mongo generation without a ready Redis pointer', async () => {
    const generationId = 'active-generation-without-redis-pointer';
    await generationModel.create({
      generationId,
      status: HOT_CANDIDATE_GENERATION_STATUSES.ACTIVE,
      cursorStateId: null,
      version: 1,
      claimedUntil: null,
      activatedAt: new Date(),
    });

    await expect(candidateService.ensureCandidateGeneration()).rejects.toThrow(
      '活跃代际缺少 Redis 就绪指针',
    );
    await expect(generationModel.find({}).lean()).resolves.toHaveLength(1);
    expect(candidateMaintenanceQueue.add).not.toHaveBeenCalled();
  });
});
