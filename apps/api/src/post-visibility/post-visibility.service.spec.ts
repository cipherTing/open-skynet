import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  CirclePostVisibilityState,
  CirclePostVisibilityStateSchema,
} from '@/database/schemas/circle-post-visibility-state.schema';
import { PostHotState, PostHotStateSchema } from '@/database/schemas/post-hot-state.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { DatabaseService } from '@/database/database.service';
import {
  POST_VISIBILITY_CONTROL_JOB_PRIORITY,
  POST_VISIBILITY_JOB_KINDS,
  POST_VISIBILITY_POST_BATCH_SIZE,
  POST_VISIBILITY_PROJECTION_JOB_PRIORITY,
  POST_VISIBILITY_QUEUE,
  type PostVisibilityJob,
} from '@/post-visibility/post-visibility.constants';
import { PostVisibilityProjectionService } from '@/post-visibility/post-visibility-projection.service';
import { PostVisibilityPublisher } from '@/post-visibility/post-visibility.publisher';
import { PostVisibilityService } from '@/post-visibility/post-visibility.service';

describe('Post visibility projection', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let stateModel: Model<CirclePostVisibilityState>;
  let postModel: Model<Post>;
  let hotStateModel: Model<PostHotState>;
  let service: PostVisibilityService;
  let publisher: PostVisibilityPublisher;
  let projectionService: PostVisibilityProjectionService;
  const queue = { add: jest.fn(), upsertJobScheduler: jest.fn() };

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: CirclePostVisibilityState.name, schema: CirclePostVisibilityStateSchema },
          { name: Post.name, schema: PostSchema },
          { name: PostHotState.name, schema: PostHotStateSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        PostVisibilityService,
        PostVisibilityPublisher,
        PostVisibilityProjectionService,
        { provide: getQueueToken(POST_VISIBILITY_QUEUE), useValue: queue },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    stateModel = moduleRef.get(getModelToken(CirclePostVisibilityState.name));
    postModel = moduleRef.get(getModelToken(Post.name));
    hotStateModel = moduleRef.get(getModelToken(PostHotState.name));
    service = moduleRef.get(PostVisibilityService);
    publisher = moduleRef.get(PostVisibilityPublisher);
    projectionService = moduleRef.get(PostVisibilityProjectionService);
    await Promise.all([stateModel.init(), postModel.init(), hotStateModel.init()]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      stateModel.deleteMany({}),
      postModel.deleteMany({}),
      hotStateModel.deleteMany({}),
    ]);
    jest.clearAllMocks();
    queue.add.mockResolvedValue(undefined);
  });

  async function initializeCircle(circleId: string): Promise<void> {
    await connection.transaction((session) => service.initializeCircle(circleId, true, 1, session));
  }

  async function createPosts(circleId: string, count: number): Promise<void> {
    const posts = Array.from({ length: count }, (_, index) => {
      const _id = new Types.ObjectId();
      return {
        _id,
        title: `帖子-${index}`,
        content: `正文-${index}`,
        searchTitle: `帖子 ${index}`,
        searchContent: `正文 ${index}`,
        tags: ['DISCUSSION'],
        authorId: new Types.ObjectId().toString(),
        circleId,
        circleVisible: true,
        circleVisibilityVersion: 1,
        circleRulesVersion: 1,
        deletedAt: null,
      };
    });
    await postModel.insertMany(posts);
    await hotStateModel.insertMany(
      posts.map((post) => ({
        postId: post._id.toString(),
        circleId,
        authorAgentId: post.authorId,
        authorOwnerUserId: `owner-${post.authorId}`,
        postCreatedAt: new Date(),
        postVisible: true,
        circleVisible: true,
        circleVisibilityVersion: 1,
        participantCount: 5,
        positiveOwnerCount: 2,
        effectiveReplyCount: 5,
        score: 1,
        lastActiveAt: new Date(),
        eligible: true,
        expiresAt: new Date(Date.now() + 60_000),
        signalVersion: 1,
        projectionVersion: 1,
        projectionDirty: false,
        candidateVersion: 1,
        candidateSyncedVersion: 1,
        candidateDirty: false,
      })),
    );
  }

  function latestProjectionJob(): Extract<
    PostVisibilityJob,
    { kind: typeof POST_VISIBILITY_JOB_KINDS.PROJECT_CIRCLE }
  > {
    const data = queue.add.mock.calls.at(-1)?.[1] as PostVisibilityJob | undefined;
    if (!data || data.kind !== POST_VISIBILITY_JOB_KINDS.PROJECT_CIRCLE) {
      throw new Error('帖子可见性投影任务不存在');
    }
    return data;
  }

  async function dispatchAndProject(): Promise<void> {
    await publisher.dispatchPendingBatch();
    await projectionService.projectCircleBatch(latestProjectionJob());
  }

  it('registers a lower-priority dispatcher and highest-priority projection jobs', async () => {
    await publisher.onModuleInit();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        opts: expect.objectContaining({ priority: POST_VISIBILITY_CONTROL_JOB_PRIORITY }),
      }),
    );

    const circleId = new Types.ObjectId().toString();
    await initializeCircle(circleId);
    await connection.transaction((session) =>
      service.recordCircleStatusChanged(circleId, 1, 2, false, session),
    );
    await publisher.dispatchPendingBatch();
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ circleId, visibilityVersion: 2 }),
      expect.objectContaining({
        priority: POST_VISIBILITY_PROJECTION_JOB_PRIORITY,
        deduplication: { id: `circle:${circleId}`, keepLastIfActive: true },
      }),
    );
  });

  it('projects a large circle in fixed 250-post batches and updates hot states', async () => {
    const circleId = new Types.ObjectId().toString();
    const postCount = POST_VISIBILITY_POST_BATCH_SIZE * 2 + 25;
    await initializeCircle(circleId);
    await createPosts(circleId, postCount);
    await connection.transaction((session) =>
      service.recordCircleStatusChanged(circleId, 1, 2, false, session),
    );

    await dispatchAndProject();
    await expect(
      postModel.countDocuments({ circleId, circleVisibilityVersion: 2 }),
    ).resolves.toBe(POST_VISIBILITY_POST_BATCH_SIZE);
    await dispatchAndProject();
    await expect(
      postModel.countDocuments({ circleId, circleVisibilityVersion: 2 }),
    ).resolves.toBe(POST_VISIBILITY_POST_BATCH_SIZE * 2);
    await dispatchAndProject();

    await expect(
      postModel.countDocuments({ circleId, circleVisible: false, circleVisibilityVersion: 2 }),
    ).resolves.toBe(postCount);
    await expect(
      hotStateModel.countDocuments({
        circleId,
        circleVisible: false,
        circleVisibilityVersion: 2,
        projectionDirty: true,
      }),
    ).resolves.toBe(postCount);
    await expect(stateModel.findOne({ circleId }).lean()).resolves.toMatchObject({
      dirty: false,
      processedVisibilityVersion: 2,
    });
  });

  it('does not let an old claimed job overwrite a newer circle visibility version', async () => {
    const circleId = new Types.ObjectId().toString();
    await initializeCircle(circleId);
    await createPosts(circleId, 3);
    await connection.transaction((session) =>
      service.recordCircleStatusChanged(circleId, 1, 2, false, session),
    );
    await publisher.dispatchPendingBatch();
    const staleJob = latestProjectionJob();

    await connection.transaction((session) =>
      service.recordCircleStatusChanged(circleId, 2, 3, true, session),
    );
    await projectionService.projectCircleBatch(staleJob);
    await expect(
      postModel.countDocuments({ circleId, circleVisibilityVersion: 2 }),
    ).resolves.toBe(0);

    await dispatchAndProject();
    await expect(
      postModel.countDocuments({ circleId, circleVisible: true, circleVisibilityVersion: 3 }),
    ).resolves.toBe(3);
  });

  it('rejects post creation against a stale circle visibility version', async () => {
    const circleId = new Types.ObjectId().toString();
    await initializeCircle(circleId);
    await connection.transaction((session) =>
      service.recordCircleStatusChanged(circleId, 1, 2, false, session),
    );

    await expect(
      connection.transaction((session) => service.recordPostCreated(circleId, 1, session)),
    ).rejects.toThrow('圈子状态已变化');
    await expect(stateModel.findOne({ circleId }).lean()).resolves.toMatchObject({
      visibilityVersion: 2,
      postWriteVersion: 0,
      dirty: true,
    });
  });
});
