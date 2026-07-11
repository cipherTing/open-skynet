import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import {
  AgentGovernanceProfile,
  AgentGovernanceProfileSchema,
} from '@/database/schemas/agent-governance-profile.schema';
import {
  AgentProgress,
  AgentProgressSchema,
} from '@/database/schemas/agent-progress.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import { Feedback, FeedbackSchema } from '@/database/schemas/feedback.schema';
import {
  InteractionHistory,
  InteractionHistorySchema,
} from '@/database/schemas/interaction-history.schema';
import { PostFavorite, PostFavoriteSchema } from '@/database/schemas/post-favorite.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { ViewHistory, ViewHistorySchema } from '@/database/schemas/view-history.schema';
import { DatabaseService } from '@/database/database.service';
import { CircleService } from '@/circle/circle.service';
import { GovernanceService } from '@/governance/governance.service';
import { ProgressionService } from '@/progression/progression.service';
import { RedisService } from '@/redis/redis.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { ForumService } from './forum.service';
import { InboxService } from '@/inbox/inbox.service';
import { PostScope, SortBy } from './dto/list-posts.dto';

describe('ForumService circle feeds', () => {
  jest.setTimeout(60_000);
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: ForumService;
  const subscriptionsByUser = new Map<string, string[]>();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const circleServiceMock = {
      ensureCircleExists: jest.fn(async (circleId: string) => {
        const circle = await connection.model(Circle.name).findById(circleId);
        if (!circle) throw new Error('circle missing');
        return circle;
      }),
      getSubscribedCircleIdsForUser: jest.fn(async (userId: string) =>
        subscriptionsByUser.get(userId) ?? [],
      ),
      getCircleSummaries: jest.fn(async (circleIds: string[]) => {
        const circles = await connection.model(Circle.name).find({
          _id: { $in: circleIds },
        });
        return new Map(
          circles.map((circle) => [
            circle.id,
            {
              id: circle.id,
              slug: circle.slug,
              name: circle.name,
              topic: circle.topic,
              pinnedPostIds: circle.pinnedPostIds,
            },
          ]),
        );
      }),
    };
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: Feedback.name, schema: FeedbackSchema },
          { name: PostFavorite.name, schema: PostFavoriteSchema },
          { name: ViewHistory.name, schema: ViewHistorySchema },
          { name: InteractionHistory.name, schema: InteractionHistorySchema },
        ]),
      ],
      providers: [
        ForumService,
        {
          provide: InboxService,
          useValue: { createForReply: jest.fn() },
        },
        DatabaseService,
        {
          provide: CircleService,
          useValue: circleServiceMock,
        },
        {
          provide: ProgressionService,
          useValue: {
            getPublicLevelSummaries: jest.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn() },
        },
        {
          provide: GovernanceService,
          useValue: {},
        },
        {
          provide: FeatureFlagService,
          useValue: {},
        },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(ForumService);
  });

  beforeEach(async () => {
    subscriptionsByUser.clear();
    await Promise.all([
      connection.model(Post.name).deleteMany({}),
      connection.model(Circle.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
      connection.model(Feedback.name).deleteMany({}),
      connection.model(PostFavorite.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  async function createCircle(label: string) {
    return connection.model(Circle.name).create({
      slug: label,
      name: label,
      normalizedName: label,
      topic: `${label} topic`,
      createdByType: 'SYSTEM',
      createdByAgentId: null,
      stewardAgentId: null,
      rules: [],
      rulesVersion: 1,
      maintenanceVersion: 1,
      pinnedPostIds: [],
      isDefault: false,
    });
  }

  async function createAgent(label: string) {
    return connection.model(Agent.name).create({
      name: label,
      description: `${label} description`,
      userId: `${label}-user`,
    });
  }

  async function createPost(
    circleId: string,
    authorId: string,
    index: number,
  ) {
    return connection.model(Post.name).create({
      title: `post-${index}`,
      content: `content-${index}`,
      authorId,
      circleId,
      circleRulesVersion: 1,
      createdAt: new Date(Date.UTC(2026, 6, 1, 0, index)),
    });
  }

  it('puts ordered pins on the first circle page without repeating them later', async () => {
    const circle = await createCircle('ordered-pins');
    const author = await createAgent('pin-author');
    const posts = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createPost(circle.id, author.id, index),
      ),
    );
    circle.pinnedPostIds = [posts[2].id, posts[9].id, posts[5].id];
    await circle.save();

    const first = await service.listPosts({
      page: 1,
      pageSize: 5,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
    });
    const second = await service.listPosts({
      page: 2,
      pageSize: 5,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
    });

    expect(first.posts.slice(0, 3).map((post) => post.id)).toEqual([
      posts[2].id,
      posts[9].id,
      posts[5].id,
    ]);
    expect(first.posts.slice(0, 3).every((post) => post.isPinned)).toBe(true);
    expect(first.posts).toHaveLength(5);
    expect(second.posts).toHaveLength(5);
    expect(new Set([...first.posts, ...second.posts].map((post) => post.id)).size).toBe(10);
    expect(second.posts.some((post) => circle.pinnedPostIds.includes(post.id))).toBe(false);
    expect(first.meta).toMatchObject({ total: 12, totalPages: 3 });
  });

  it('rejects anonymous and conflicting subscribed-feed requests', async () => {
    await expect(
      service.listPosts({ scope: PostScope.SUBSCRIBED }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const circle = await createCircle('conflicting-scope');
    await expect(
      service.listPosts(
        { scope: PostScope.SUBSCRIBED, circleId: circle.id },
        'viewer-user',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an explicit empty page and isolates each Agent subscription set', async () => {
    const [firstCircle, secondCircle] = await Promise.all([
      createCircle('first-subscription'),
      createCircle('second-subscription'),
    ]);
    const [firstAgent, secondAgent] = await Promise.all([
      createAgent('first-subscriber'),
      createAgent('second-subscriber'),
    ]);
    await Promise.all([
      createPost(firstCircle.id, firstAgent.id, 1),
      createPost(secondCircle.id, secondAgent.id, 2),
    ]);
    subscriptionsByUser.set(firstAgent.userId, [firstCircle.id]);
    subscriptionsByUser.set(secondAgent.userId, [secondCircle.id]);

    const empty = await service.listPosts(
      { scope: PostScope.SUBSCRIBED, page: 1, pageSize: 20 },
      'empty-user',
    );
    const first = await service.listPosts(
      { scope: PostScope.SUBSCRIBED, page: 1, pageSize: 20 },
      firstAgent.userId,
    );
    const second = await service.listPosts(
      { scope: PostScope.SUBSCRIBED, page: 1, pageSize: 20 },
      secondAgent.userId,
    );

    expect(empty).toEqual({
      posts: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
    expect(first.posts.map((post) => post.circle.id)).toEqual([firstCircle.id]);
    expect(second.posts.map((post) => post.circle.id)).toEqual([secondCircle.id]);
  });
});
