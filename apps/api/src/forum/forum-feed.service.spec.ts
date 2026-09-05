import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import {
  AgentGovernanceProfile,
  AgentGovernanceProfileSchema,
} from '@/database/schemas/agent-governance-profile.schema';
import { AgentProgress, AgentProgressSchema } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent, AgentXpEventSchema } from '@/database/schemas/agent-xp-event.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import { Feedback, FeedbackSchema } from '@/database/schemas/feedback.schema';
import {
  InteractionHistory,
  InteractionHistorySchema,
} from '@/database/schemas/interaction-history.schema';
import { PostFavorite, PostFavoriteSchema } from '@/database/schemas/post-favorite.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { PostRevision, PostRevisionSchema } from '@/database/schemas/post-revision.schema';
import { ReplyRevision, ReplyRevisionSchema } from '@/database/schemas/reply-revision.schema';
import { ViewHistory, ViewHistorySchema } from '@/database/schemas/view-history.schema';
import {
  POST_VIEW_COUNTER_SHARD_COUNT,
  PostViewCounterShard,
  PostViewCounterShardSchema,
} from '@/database/schemas/post-view-counter-shard.schema';
import {
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from '@/database/schemas/content-review-request.schema';
import { GovernanceCase, GovernanceCaseSchema } from '@/database/schemas/governance-case.schema';
import { DatabaseService } from '@/database/database.service';
import { CircleService } from '@/circle/circle.service';
import { GovernanceService } from '@/governance/governance.service';
import { ProgressionService } from '@/progression/progression.service';
import { RedisService } from '@/redis/redis.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { ForumService } from './forum.service';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';
import { PostScope, SortBy } from './dto/list-posts.dto';
import { PostVisibilityService } from '@/post-visibility/post-visibility.service';
import { ReplyCounterService } from '@/forum/reply-counter.service';
import { PostViewCounterService } from '@/forum/post-view-counter.service';
import { ForumStatisticsService } from '@/forum/forum-statistics.service';
import { ForumAgentInteractionService } from '@/forum/forum-agent-interaction.service';
import { FEEDBACK_TARGET_TYPES } from '@/forum/feedback.constants';
import {
  BusinessCalendarConfig,
  BusinessCalendarConfigSchema,
} from '@/database/schemas/business-calendar-config.schema';
import { BusinessCalendarService } from '@/system/business-calendar.service';
import { circleErrors } from '@/common/errors/business-errors';

type ForumServiceReplyItem = Awaited<ReturnType<ForumService['listReplies']>>['items'][number];

function isVisibleForumServiceReply(
  reply: ForumServiceReplyItem,
): reply is Extract<ForumServiceReplyItem, { content: string }> {
  return reply.deletedAt === null;
}

describe('ForumService circle feeds', () => {
  jest.setTimeout(60_000);
  let mongod: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: ForumService;
  let agentInteractionService: ForumAgentInteractionService;
  let databaseService: DatabaseService;
  const membershipsByAgent = new Map<string, string[]>();
  const featureFlagServiceMock = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(false),
  };
  const circleServiceMock = {
    ensureCircleExists: jest.fn(async (circleId: string) => {
      const circle = await connection.model(Circle.name).findById(circleId);
      if (!circle) throw new Error('circle missing');
      return circle;
    }),
    assertAgentPostAllowed: jest.fn(
      async (circleId: string, _allowOfficialCirclePostingBypass = false) => {
        const circle = await connection.model(Circle.name).findById(circleId);
        if (!circle) throw new Error('circle missing');
        return circle;
      },
    ),
    filterJoinedCircleIds: jest.fn(async (agentId: string, circleIds: string[]) => {
      const joined = new Set(membershipsByAgent.get(agentId) ?? []);
      return new Set(circleIds.filter((circleId) => joined.has(circleId)));
    }),
    filterActiveCircleIds: jest.fn(async (circleIds: string[]) => {
      const circles = await connection.model(Circle.name).find({
        _id: { $in: circleIds },
        status: 'ACTIVE',
      });
      return circles.map((circle) => circle.id);
    }),
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
          },
        ]),
      );
    }),
    incrementPostCount: jest.fn().mockResolvedValue(undefined),
  };
  const redisValues = new Map<string, string>();
  const redisClient = {
    get: jest.fn(async (key: string) => redisValues.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      redisValues.set(key, value);
      return 'OK';
    }),
  };

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentXpEvent.name, schema: AgentXpEventSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: Post.name, schema: PostSchema },
          { name: PostRevision.name, schema: PostRevisionSchema },
          { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: ReplyRevision.name, schema: ReplyRevisionSchema },
          { name: Feedback.name, schema: FeedbackSchema },
          { name: PostFavorite.name, schema: PostFavoriteSchema },
          { name: ViewHistory.name, schema: ViewHistorySchema },
          { name: PostViewCounterShard.name, schema: PostViewCounterShardSchema },
          { name: InteractionHistory.name, schema: InteractionHistorySchema },
          { name: BusinessCalendarConfig.name, schema: BusinessCalendarConfigSchema },
        ]),
      ],
      providers: [
        ForumService,
        ForumStatisticsService,
        ForumAgentInteractionService,
        ReplyCounterService,
        PostViewCounterService,
        DatabaseService,
        BusinessCalendarService,
        {
          provide: CircleService,
          useValue: circleServiceMock,
        },
        ProgressionService,
        {
          provide: RedisService,
          useValue: { getClient: () => redisClient },
        },
        {
          provide: GovernanceService,
          useValue: {},
        },
        {
          provide: FeatureFlagService,
          useValue: featureFlagServiceMock,
        },
        {
          provide: HotRankingService,
          useValue: {
            initializePost: jest.fn(),
            recordReplyCreated: jest.fn(),
            recordFeedbackContribution: jest.fn(),
            listRandomHotPosts: jest.fn(),
            getHotPostIds: jest.fn().mockResolvedValue(new Set()),
          },
        },
        {
          provide: PostVisibilityService,
          useValue: { recordPostCreated: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(ForumService);
    agentInteractionService = moduleRef.get(ForumAgentInteractionService);
    databaseService = moduleRef.get(DatabaseService);
    await connection.model(Post.name).init();
  });

  beforeEach(async () => {
    membershipsByAgent.clear();
    redisValues.clear();
    jest.clearAllMocks();
    featureFlagServiceMock.assertEnabled.mockResolvedValue(undefined);
    featureFlagServiceMock.isEnabled.mockResolvedValue(false);
    circleServiceMock.assertAgentPostAllowed.mockImplementation(async (circleId: string) => {
      const circle = await connection.model(Circle.name).findById(circleId);
      if (!circle) throw new Error('circle missing');
      return circle;
    });
    await Promise.all([
      connection.model(AgentProgress.name).deleteMany({}),
      connection.collection('agent_xp_events').deleteMany({}),
      connection.model(Post.name).deleteMany({}),
      connection.collection('post_revisions').deleteMany({}),
      connection.model(Reply.name).deleteMany({}),
      connection.collection('reply_revisions').deleteMany({}),
      connection.model(ContentReviewRequest.name).deleteMany({}),
      connection.model(GovernanceCase.name).deleteMany({}),
      connection.model(Circle.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
      connection.model(Feedback.name).deleteMany({}),
      connection.model(PostFavorite.name).deleteMany({}),
      connection.model(ViewHistory.name).deleteMany({}),
      connection.model(PostViewCounterShard.name).deleteMany({}),
      connection.collection('reports').deleteMany({}),
      connection.collection('interaction_histories').deleteMany({}),
      connection.collection('circle_memberships').deleteMany({}),
      connection.collection('governance_votes').deleteMany({}),
      connection.collection('circle_proposal_stances').deleteMany({}),
      connection.collection('circle_proposal_votes').deleteMany({}),
      connection.collection('circle_proposal_comments').deleteMany({}),
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
      rules: [],
      rulesVersion: 1,
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

  async function createPost(circleId: string, authorId: string, index: number) {
    const post = await connection.model(Post.name).create({
      title: `post-${index}`,
      content: `content-${index}`,
      tags: ['DISCUSSION'],
      contentVersion: 1,
      lastEditedAt: null,
      authorId,
      circleId,
      circleRulesVersion: 1,
      createdAt: new Date(Date.UTC(2026, 6, 1, 0, index)),
    });
    await connection.model(PostRevision.name).create({
      postId: post.id,
      version: 1,
      title: post.title,
      content: post.content,
      tags: post.tags,
      authorId: post.authorId,
    });
    return post;
  }

  it('paginates circle posts without injecting extra items', async () => {
    const circle = await createCircle('circle-pagination');
    const author = await createAgent('circle-author');
    const posts = await Promise.all(
      Array.from({ length: 12 }, (_, index) => createPost(circle.id, author.id, index)),
    );

    const first = await service.listPosts({
      limit: 5,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
    });
    if (!first.nextCursor) throw new Error('第一页缺少帖子游标');
    const second = await service.listPosts({
      limit: 5,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
      cursor: first.nextCursor,
    });

    expect(first.items.map((post) => post.id)).toEqual(
      posts
        .slice(7)
        .reverse()
        .map((post) => post.id),
    );
    expect(first.items).toHaveLength(5);
    expect(first.items[0]).not.toHaveProperty('authorId');
    expect(first.items[0]).not.toHaveProperty('circleId');
    expect(first.items[0]).not.toHaveProperty('circleVisible');
    expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map((post) => post.id)).size).toBe(10);
    expect(second.items.map((post) => post.id)).toEqual(
      posts
        .slice(2, 7)
        .reverse()
        .map((post) => post.id),
    );
    expect(second.nextCursor).not.toBeNull();
  });

  it('keeps pinned posts first only in an unfiltered latest circle feed across cursor pages', async () => {
    const circle = await createCircle('pinned-circle-pagination');
    const author = await createAgent('pinned-circle-author');
    const posts = await Promise.all(
      Array.from({ length: 4 }, (_, index) => createPost(circle.id, author.id, index)),
    );
    await connection.collection('posts').updateMany(
      { _id: { $in: [posts[0]._id, posts[1]._id] } },
      {
        $set: {
          pinnedAt: new Date('2026-07-02T00:00:00.000Z'),
          circleVisible: true,
          deletedAt: null,
        },
      },
    );
    await connection
      .collection('posts')
      .updateOne(
        { _id: posts[1]._id },
        { $set: { pinnedAt: new Date('2026-07-03T00:00:00.000Z') } },
      );

    const first = await service.listPosts({
      limit: 2,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
    });
    if (!first.nextCursor) throw new Error('置顶第一页缺少游标');
    const second = await service.listPosts({
      limit: 2,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
      cursor: first.nextCursor,
    });
    const filtered = await service.listPosts({
      limit: 2,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
      tags: ['DISCUSSION'],
    });
    const global = await service.listPosts({ limit: 2, sortBy: SortBy.LATEST });

    expect(first.items.map((post) => post.id)).toEqual([posts[1].id, posts[0].id]);
    expect(second.items.map((post) => post.id)).toEqual([posts[3].id, posts[2].id]);
    expect(new Set([...first.items, ...second.items].map((post) => post.id)).size).toBe(4);
    expect(filtered.items.map((post) => post.id)).toEqual([posts[3].id, posts[2].id]);
    expect(global.items.map((post) => post.id)).toEqual([posts[3].id, posts[2].id]);
  });

  it('uses resource-bound cursors for Agent posts, replies, interactions, and view history', async () => {
    const circle = await createCircle('agent-cursor-history');
    const [author, target] = await Promise.all([
      createAgent('agent-cursor-author'),
      createAgent('agent-cursor-target'),
    ]);
    const posts = await Promise.all(
      Array.from({ length: 3 }, (_, index) => createPost(circle.id, author.id, index)),
    );
    const sharedTime = new Date('2026-07-20T00:00:00.000Z');
    await connection
      .collection('posts')
      .updateMany(
        { _id: { $in: posts.map((post) => post._id) } },
        { $set: { createdAt: sharedTime } },
      );

    const firstPosts = await service.listAgentPosts(author.id, { limit: 2 });
    expect(firstPosts.items).toHaveLength(2);
    expect(firstPosts.nextCursor).not.toBeNull();
    const secondPosts = await service.listAgentPosts(author.id, {
      limit: 2,
      cursor: firstPosts.nextCursor ?? undefined,
    });
    expect(secondPosts.items).toHaveLength(1);
    expect(secondPosts.nextCursor).toBeNull();
    expect(new Set([...firstPosts.items, ...secondPosts.items].map((post) => post.id)).size).toBe(
      3,
    );
    await expect(
      service.listAgentReplies(author.id, {
        limit: 2,
        cursor: firstPosts.nextCursor ?? undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const replies = await connection.model(Reply.name).create(
      posts.map((post, index) => ({
        content: `agent-cursor-reply-${index}`,
        postId: post.id,
        authorId: author.id,
        authorOwnerUserIdSnapshot: author.userId,
        parentReplyId: null,
        circleRulesVersion: 1,
        createdAt: sharedTime,
      })),
    );
    await connection
      .collection('replies')
      .updateMany(
        { _id: { $in: replies.map((reply) => reply._id) } },
        { $set: { createdAt: sharedTime } },
      );
    const firstReplies = await service.listAgentReplies(author.id, { limit: 2 });
    const secondReplies = await service.listAgentReplies(author.id, {
      limit: 2,
      cursor: firstReplies.nextCursor ?? undefined,
    });
    expect(
      new Set([...firstReplies.items, ...secondReplies.items].map((reply) => reply.id)).size,
    ).toBe(3);

    for (const post of posts) {
      await agentInteractionService.recordFeedback({
        agentId: author.id,
        feedbackType: 'SPARK',
        targetType: FEEDBACK_TARGET_TYPES.POST,
        postId: post.id,
        postTitle: post.title,
        targetAuthorId: target.id,
      });
      await connection.model(ViewHistory.name).create({
        agentId: author.id,
        postId: post.id,
        viewDay: '2026-07-20',
        viewedAt: sharedTime,
      });
    }
    await connection
      .collection('interaction_histories')
      .updateMany({ agentId: author.id }, { $set: { createdAt: sharedTime } });

    const firstInteractions = await service.listAgentInteractions(author.id, { limit: 2 });
    const secondInteractions = await service.listAgentInteractions(author.id, {
      limit: 2,
      cursor: firstInteractions.nextCursor ?? undefined,
    });
    expect(
      new Set(
        [...firstInteractions.items, ...secondInteractions.items].map(
          (interaction) => interaction.id,
        ),
      ).size,
    ).toBe(3);

    const firstViews = await service.listAgentViewHistory(author.id, { limit: 2 });
    const secondViews = await service.listAgentViewHistory(author.id, {
      limit: 2,
      cursor: firstViews.nextCursor ?? undefined,
    });
    const viewedPostIds = [...firstViews.items, ...secondViews.items]
      .map((item) => item.post?.id)
      .filter((postId): postId is string => typeof postId === 'string');
    expect(new Set(viewedPostIds).size).toBe(3);
  });

  it('keeps filtered favorite records inside the cursor window instead of scanning ahead', async () => {
    const circle = await createCircle('agent-favorite-cursor');
    const author = await createAgent('agent-favorite-author');
    const posts = await Promise.all(
      Array.from({ length: 3 }, (_, index) => createPost(circle.id, author.id, index)),
    );
    for (const post of posts) await service.favoritePost(author.id, post.id);
    const timestamps = [
      new Date('2026-07-23T03:00:00.000Z'),
      new Date('2026-07-23T02:00:00.000Z'),
      new Date('2026-07-23T01:00:00.000Z'),
    ];
    await Promise.all(
      posts.map((post, index) =>
        connection
          .collection('post_favorites')
          .updateOne(
            { agentId: author.id, postId: post.id },
            { $set: { createdAt: timestamps[index] } },
          ),
      ),
    );
    await connection
      .collection('posts')
      .updateOne({ _id: posts[0]._id }, { $set: { deletedAt: new Date() } });

    const first = await service.listAgentFavorites(author.id, { limit: 2 }, author.userId);
    expect(first.items.map((item) => item.post.id)).toEqual([posts[1].id]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.listAgentFavorites(
      author.id,
      { limit: 2, cursor: first.nextCursor ?? undefined },
      author.userId,
    );
    expect(second.items.map((item) => item.post.id)).toEqual([posts[2].id]);
    expect(second.nextCursor).toBeNull();
  });

  it('returns short favorite and view-history pages when a source circle becomes unavailable', async () => {
    const [activeCircle, unavailableCircle] = await Promise.all([
      createCircle('agent-history-active-circle'),
      createCircle('agent-history-unavailable-circle'),
    ]);
    const author = await createAgent('agent-history-circle-author');
    const [activePost, unavailablePost] = await Promise.all([
      createPost(activeCircle.id, author.id, 1),
      createPost(unavailableCircle.id, author.id, 2),
    ]);
    await Promise.all([
      service.favoritePost(author.id, activePost.id),
      service.favoritePost(author.id, unavailablePost.id),
      connection.model(ViewHistory.name).create({
        agentId: author.id,
        postId: activePost.id,
        viewDay: '2026-07-23',
        viewedAt: new Date('2026-07-23T01:00:00.000Z'),
      }),
      connection.model(ViewHistory.name).create({
        agentId: author.id,
        postId: unavailablePost.id,
        viewDay: '2026-07-23',
        viewedAt: new Date('2026-07-23T02:00:00.000Z'),
      }),
    ]);
    await connection
      .collection('post_favorites')
      .updateOne(
        { agentId: author.id, postId: unavailablePost.id },
        { $set: { createdAt: new Date('2026-07-23T02:00:00.000Z') } },
      );
    await connection
      .collection('post_favorites')
      .updateOne(
        { agentId: author.id, postId: activePost.id },
        { $set: { createdAt: new Date('2026-07-23T01:00:00.000Z') } },
      );
    await connection
      .collection('circles')
      .updateOne({ _id: unavailableCircle._id }, { $set: { status: 'BANNED' } });

    const favorites = await service.listAgentFavorites(author.id, { limit: 2 }, author.userId);
    const views = await service.listAgentViewHistory(author.id, { limit: 2 });

    expect(favorites.items.map((item) => item.post.id)).toEqual([activePost.id]);
    expect(favorites.nextCursor).toBeNull();
    expect(views.items.map((item) => item.post?.id)).toEqual([activePost.id]);
    expect(views.nextCursor).toBeNull();
  });

  it('keeps hidden Agent history records inside their source cursor window', async () => {
    const circle = await createCircle('agent-hidden-source-cursor');
    const [author, target] = await Promise.all([
      createAgent('agent-hidden-source-author'),
      createAgent('agent-hidden-source-target'),
    ]);
    const posts = await Promise.all(
      Array.from({ length: 3 }, (_, index) => createPost(circle.id, author.id, index)),
    );
    const replyModel = connection.model(Reply.name);
    const replies = await replyModel.create(
      posts.map((post, index) => ({
        content: `agent-hidden-source-reply-${index}`,
        postId: post.id,
        authorId: author.id,
        authorOwnerUserIdSnapshot: author.userId,
        parentReplyId: null,
        circleRulesVersion: 1,
      })),
    );
    for (const post of posts) {
      await agentInteractionService.recordFeedback({
        agentId: author.id,
        feedbackType: 'SPARK',
        targetType: FEEDBACK_TARGET_TYPES.POST,
        postId: post.id,
        postTitle: post.title,
        targetAuthorId: target.id,
      });
      await connection.model(ViewHistory.name).create({
        agentId: author.id,
        postId: post.id,
        viewDay: '2026-07-23',
        viewedAt: post.createdAt,
      });
    }
    const timestamps = [
      new Date('2026-07-23T03:00:00.000Z'),
      new Date('2026-07-23T02:00:00.000Z'),
      new Date('2026-07-23T01:00:00.000Z'),
    ];
    await Promise.all(
      posts.map(async (post, index) => {
        await connection
          .collection('posts')
          .updateOne({ _id: post._id }, { $set: { createdAt: timestamps[index] } });
        await connection
          .collection('view_histories')
          .updateOne(
            { agentId: author.id, postId: post.id },
            { $set: { viewedAt: timestamps[index] } },
          );
        await connection
          .collection('interaction_histories')
          .updateOne(
            { agentId: author.id, postId: post.id },
            { $set: { createdAt: timestamps[index] } },
          );
        await connection
          .collection('replies')
          .updateOne({ _id: replies[index]._id }, { $set: { createdAt: timestamps[index] } });
      }),
    );
    await connection
      .collection('posts')
      .updateOne({ _id: posts[0]._id }, { $set: { deletedAt: new Date() } });
    await connection
      .collection('replies')
      .updateOne({ _id: replies[0]._id }, { $set: { deletedAt: new Date() } });

    const firstPosts = await service.listAgentPosts(author.id, { limit: 2 });
    expect(firstPosts.items.map((post) => post.id)).toEqual([posts[1].id]);
    expect(firstPosts.nextCursor).not.toBeNull();
    const secondPosts = await service.listAgentPosts(author.id, {
      limit: 2,
      cursor: firstPosts.nextCursor ?? undefined,
    });
    expect(secondPosts.items.map((post) => post.id)).toEqual([posts[2].id]);

    const firstReplies = await service.listAgentReplies(author.id, { limit: 2 });
    expect(firstReplies.items.map((reply) => reply.id)).toEqual([replies[1].id]);
    expect(firstReplies.nextCursor).not.toBeNull();

    const firstInteractions = await service.listAgentInteractions(author.id, { limit: 2 });
    expect(firstInteractions.items.map((interaction) => interaction.post.id)).toEqual([
      posts[1].id,
    ]);
    expect(firstInteractions.nextCursor).not.toBeNull();

    const firstViews = await service.listAgentViewHistory(author.id, { limit: 2 });
    expect(firstViews.items.map((history) => history.post?.id)).toEqual([posts[1].id]);
    expect(firstViews.nextCursor).not.toBeNull();
  });

  it('hides reply interactions while their top-level branch is unavailable', async () => {
    const circle = await createCircle('agent-reply-interaction-visibility');
    const [actor, target] = await Promise.all([
      createAgent('agent-reply-interaction-actor'),
      createAgent('agent-reply-interaction-target'),
    ]);
    const post = await createPost(circle.id, target.id, 1);
    const replyModel = connection.model(Reply.name);
    const parent = await replyModel.create({
      content: 'top-level reply',
      postId: post.id,
      authorId: target.id,
      authorOwnerUserIdSnapshot: target.userId,
      parentReplyId: null,
      circleRulesVersion: 1,
    });
    const child = await replyModel.create({
      content: 'child reply',
      postId: post.id,
      authorId: target.id,
      authorOwnerUserIdSnapshot: target.userId,
      parentReplyId: parent.id,
      circleRulesVersion: 1,
    });
    await agentInteractionService.recordFeedback({
      agentId: actor.id,
      feedbackType: 'SPARK',
      targetType: FEEDBACK_TARGET_TYPES.REPLY,
      postId: post.id,
      postTitle: post.title,
      targetAuthorId: target.id,
      replyId: child.id,
      replyContent: child.content,
    });
    await replyModel.updateOne({ _id: parent.id }, { $set: { deletedAt: new Date() } });

    await expect(service.listAgentInteractions(actor.id, { limit: 20 })).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    });
    await replyModel.updateOne({ _id: parent.id }, { $set: { deletedAt: null } });
    await expect(service.listAgentInteractions(actor.id, { limit: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: expect.any(String) })],
      nextCursor: null,
    });
  });

  it('returns a committed view count and Agent history, and rolls both back on failure', async () => {
    const circle = await createCircle('view-contract');
    const [author, viewer] = await Promise.all([
      createAgent('view-author'),
      createAgent('view-viewer'),
    ]);
    const post = await createPost(circle.id, author.id, 1);

    const recorded = await service.recordPostView(post.id, viewer.id);
    expect(recorded).toEqual({
      postId: post.id,
      viewCount: 1,
      viewHistory: { recordedAt: expect.any(String) },
    });
    expect(
      await connection.model(ViewHistory.name).countDocuments({
        agentId: viewer.id,
        postId: post.id,
      }),
    ).toBe(1);

    const firstRecordedAt = recorded.viewHistory?.recordedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const repeated = await service.recordPostView(post.id, viewer.id);
    expect(repeated.viewHistory?.recordedAt).toBe(firstRecordedAt);
    expect(
      await connection.model(ViewHistory.name).countDocuments({
        agentId: viewer.id,
        postId: post.id,
      }),
    ).toBe(1);

    const updateHistory = jest
      .spyOn(connection.model(ViewHistory.name), 'updateOne')
      .mockRejectedValueOnce(new Error('history unavailable'));
    const secondPost = await createPost(circle.id, author.id, 2);
    await expect(service.recordPostView(secondPost.id, viewer.id)).rejects.toThrow(
      'history unavailable',
    );
    expect(
      await connection.model(PostViewCounterShard.name).countDocuments({ postId: secondPost.id }),
    ).toBe(0);
    updateHistory.mockRestore();

    await expect(service.recordPostView(secondPost.id, null)).resolves.toEqual({
      postId: secondPost.id,
      viewCount: 1,
      viewHistory: null,
    });
  });

  it('keeps concurrent view increments exact while limiting one post to fixed counter shards', async () => {
    const circle = await createCircle('view-counter-shards');
    const author = await createAgent('view-counter-author');
    const post = await createPost(circle.id, author.id, 1);
    await connection.model(Post.name).updateOne({ _id: post.id }, { $set: { viewCount: 7 } });

    const concurrentViews = 64;
    await Promise.all(
      Array.from({ length: concurrentViews }, () => service.recordPostView(post.id, null)),
    );

    const shards = await connection
      .model(PostViewCounterShard.name)
      .find({ postId: post.id })
      .lean<Array<{ shard: number; count: number }>>();
    expect(shards.length).toBeGreaterThan(0);
    expect(shards.length).toBeLessThanOrEqual(POST_VIEW_COUNTER_SHARD_COUNT);
    expect(
      shards.every((shard) => shard.shard >= 0 && shard.shard < POST_VIEW_COUNTER_SHARD_COUNT),
    ).toBe(true);
    expect(shards.reduce((total, shard) => total + shard.count, 0)).toBe(concurrentViews);
    expect((await connection.model(Post.name).findById(post.id))?.viewCount).toBe(7);

    const page = await service.listPosts({
      limit: 20,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].viewCount).toBe(7 + concurrentViews);
  });

  it('rejects anonymous and conflicting my-circles-feed requests', async () => {
    await expect(service.listPosts({ scope: PostScope.MY_CIRCLES })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const circle = await createCircle('conflicting-scope');
    const viewer = await createAgent('conflicting-scope-viewer');
    await expect(
      service.listPosts({ scope: PostScope.MY_CIRCLES, circleId: circle.id }, viewer.userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects feedback when the target is removed after the initial read', async () => {
    const circle = await createCircle('feedback-removal-race');
    const [author, actor] = await Promise.all([
      createAgent('feedback-removal-author'),
      createAgent('feedback-removal-actor'),
    ]);
    const post = await createPost(circle.id, author.id, 1);
    await connection.model(Feedback.name).create({
      type: 'SPARK',
      targetType: 'POST',
      agentId: actor.id,
      agentOwnerUserIdSnapshot: actor.userId,
      postId: post.id,
      replyId: null,
      contextPostId: post.id,
    });
    const runTransaction = databaseService.$transaction.bind(databaseService);
    const transaction = jest
      .spyOn(databaseService, '$transaction')
      .mockImplementationOnce(async (callback) => {
        await connection
          .model(Post.name)
          .updateOne({ _id: post.id }, { $set: { deletedAt: new Date() } });
        return runTransaction(callback);
      });

    await expect(
      service.feedbackOnPost(actor.id, post.id, { type: 'SPARK' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await connection.model(Feedback.name).countDocuments({ postId: post.id })).toBe(1);
    transaction.mockRestore();
  });

  it('creates only a pending review request when post review is enabled', async () => {
    const circle = await createCircle('post-review-circle');
    const author = await createAgent('post-review-author');
    featureFlagServiceMock.isEnabled.mockResolvedValue(true);

    const result = await service.createPost(author.id, {
      title: '等待审核的帖子',
      content: '审核通过前不应该出现在帖子列表中。',
      circleId: circle.id,
      tags: ['QUESTION'],
    });

    if (result.outcome !== 'PENDING_REVIEW') throw new Error('帖子应进入审核');
    expect(result.progressDelta).toMatchObject({
      xpGained: 0,
      staminaCost: 8,
      progression: {
        level: { xpTotal: 0 },
        stamina: { current: 92 },
      },
    });
    expect(await connection.model(Post.name).countDocuments()).toBe(0);
    const request = await connection.model(ContentReviewRequest.name).findOne();
    if (!request) throw new Error('待审核帖子工单未创建');
    expect(request).toMatchObject({
      type: 'POST',
      status: 'PENDING',
      requesterAgentId: author.id,
      payload: {
        title: '等待审核的帖子',
        content: '审核通过前不应该出现在帖子列表中。',
        circleId: circle.id,
      },
    });
    expect(
      await connection.model(AgentProgress.name).findOne({ agentId: author.id }),
    ).toMatchObject({
      xpTotal: 0,
      staminaCurrent: 92,
      dailyCounters: { posts: 0 },
    });
    expect(await connection.model(AgentXpEvent.name).find({ agentId: author.id })).toEqual([
      expect.objectContaining({
        sourceType: 'CREATE_POST',
        sourceId: request.id,
        reasonKey: 'stamina-charge',
        xp: 0,
      }),
    ]);

    await connection.transaction((session) => service.publishReviewedPost(request, session));
    expect(await connection.model(Post.name).countDocuments()).toBe(1);
    expect(
      await connection.model(AgentProgress.name).findOne({ agentId: author.id }),
    ).toMatchObject({
      xpTotal: 18,
      staminaCurrent: 92,
      dailyCounters: { posts: 1 },
    });
    expect(await connection.model(AgentXpEvent.name).countDocuments({ agentId: author.id })).toBe(
      3,
    );
  });

  it('rejects a closed official circle before creating a post review request or charging stamina', async () => {
    const circle = await createCircle('closed-official-posting-circle');
    const author = await createAgent('closed-official-posting-author');
    featureFlagServiceMock.isEnabled.mockResolvedValue(true);
    circleServiceMock.assertAgentPostAllowed.mockRejectedValue(circleErrors.agentPostingDisabled());

    await expect(
      service.createPost(author.id, {
        title: '不会进入审核的外部投稿',
        content: '关闭后必须在审核工单创建前阻断。',
        circleId: circle.id,
        tags: ['DISCUSSION'],
      }),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_AGENT_POSTING_DISABLED' } });
    expect(await connection.model(ContentReviewRequest.name).countDocuments()).toBe(0);
    expect(await connection.model(Post.name).countDocuments()).toBe(0);
    expect(await connection.model(AgentProgress.name).findOne({ agentId: author.id })).toBeNull();
  });

  it('rechecks a closed official circle before publishing an already-reviewed post', async () => {
    const circle = await createCircle('reviewed-then-closed-official-circle');
    const author = await createAgent('reviewed-then-closed-author');
    featureFlagServiceMock.isEnabled.mockResolvedValue(true);
    const submitted = await service.createPost(author.id, {
      title: '等待审核后被关闭的投稿',
      content: '批准时仍必须重新检查圈子发帖策略。',
      circleId: circle.id,
      tags: ['DISCUSSION'],
    });
    if (submitted.outcome !== 'PENDING_REVIEW') throw new Error('帖子应进入审核');
    const request = await connection
      .model(ContentReviewRequest.name)
      .findById(submitted.reviewRequestId);
    if (!request) throw new Error('待审核帖子申请不存在');
    circleServiceMock.assertAgentPostAllowed.mockRejectedValue(circleErrors.agentPostingDisabled());

    await expect(
      connection.transaction((session) => service.publishReviewedPost(request, session)),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_AGENT_POSTING_DISABLED' } });
    expect(await connection.model(Post.name).countDocuments()).toBe(0);
    expect(
      await connection.model(AgentProgress.name).findOne({ agentId: author.id }),
    ).toMatchObject({ xpTotal: 0, staminaCurrent: 92, dailyCounters: { posts: 0 } });
  });

  it('preserves the trusted browser administrator posting privilege through post review', async () => {
    const circle = await createCircle('admin-reviewed-official-circle');
    const author = await createAgent('admin-reviewed-official-author');
    featureFlagServiceMock.isEnabled.mockResolvedValue(true);
    circleServiceMock.assertAgentPostAllowed.mockImplementation(
      async (_circleId: string, allowOfficialCirclePostingBypass: boolean) => {
        if (!allowOfficialCirclePostingBypass) throw circleErrors.agentPostingDisabled();
        return circle;
      },
    );

    const submitted = await service.createPost(
      author.id,
      {
        title: '管理员审核后发布的官方公告',
        content: '审核批准后仍应保留管理员在关闭官方圈子发帖的权限。',
        circleId: circle.id,
        tags: ['DISCUSSION'],
      },
      undefined,
      true,
    );
    if (submitted.outcome !== 'PENDING_REVIEW') throw new Error('帖子应进入审核');
    const request = await connection
      .model(ContentReviewRequest.name)
      .findById(submitted.reviewRequestId);
    if (!request) throw new Error('待审核帖子申请不存在');

    await expect(
      connection.transaction((session) => service.publishReviewedPost(request, session)),
    ).resolves.toBeDefined();
    expect(request.payload).toMatchObject({ submissionOrigin: 'ADMIN' });
    expect(await connection.model(Post.name).countDocuments()).toBe(1);
  });

  it('allows administrator reads of soft-deleted posts while regular reads stay hidden', async () => {
    const circle = await createCircle('admin-removed-post-circle');
    const author = await createAgent('admin-removed-post-author');
    const removedPost = await createPost(circle.id, author.id, 1);
    await connection.model(Post.name).findByIdAndUpdate(removedPost.id, {
      deletedAt: new Date(),
      removalSource: 'ADMIN',
    });

    await expect(service.getPost(removedPost.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'POST_NOT_FOUND' }),
    });
    await expect(service.getPost(removedPost.id, undefined, true)).resolves.toMatchObject({
      id: removedPost.id,
      deletedAt: expect.any(Date),
      removalSource: 'ADMIN',
    });
  });

  it('returns an explicit empty page and isolates each Agent membership set', async () => {
    const [firstCircle, secondCircle] = await Promise.all([
      createCircle('first-membership'),
      createCircle('second-membership'),
    ]);
    const [firstAgent, secondAgent] = await Promise.all([
      createAgent('first-member'),
      createAgent('second-member'),
    ]);
    await Promise.all([
      createPost(firstCircle.id, firstAgent.id, 1),
      createPost(secondCircle.id, secondAgent.id, 2),
    ]);
    const emptyAgent = await createAgent('empty-member');
    membershipsByAgent.set(firstAgent.id, [firstCircle.id]);
    membershipsByAgent.set(secondAgent.id, [secondCircle.id]);

    const empty = await service.listPosts(
      { scope: PostScope.MY_CIRCLES, sortBy: SortBy.LATEST, limit: 20 },
      emptyAgent.userId,
    );
    const first = await service.listPosts(
      { scope: PostScope.MY_CIRCLES, sortBy: SortBy.LATEST, limit: 20 },
      firstAgent.userId,
    );
    const second = await service.listPosts(
      { scope: PostScope.MY_CIRCLES, sortBy: SortBy.LATEST, limit: 20 },
      secondAgent.userId,
    );

    expect(empty).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(first.items.map((post) => post.circle.id)).toEqual([firstCircle.id]);
    expect(second.items.map((post) => post.circle.id)).toEqual([secondCircle.id]);
  });

  it('searches segmented Chinese and English terms through the text index', async () => {
    const circle = await createCircle('search-index');
    const author = await createAgent('search-author');
    const [titleMatch, contentMatch, unrelated] = await Promise.all([
      createPost(circle.id, author.id, 1),
      createPost(circle.id, author.id, 2),
      createPost(circle.id, author.id, 3),
    ]);
    titleMatch.title = '这是一个论坛帖子';
    contentMatch.content = 'field notes for the quantum transport';
    unrelated.title = 'ordinary release notes';
    await Promise.all([titleMatch.save(), contentMatch.save(), unrelated.save()]);

    const chineseResult = await service.listPosts({
      limit: 20,
      sortBy: SortBy.LATEST,
      search: '论坛',
    });
    const englishResult = await service.listPosts({
      limit: 20,
      sortBy: SortBy.LATEST,
      search: 'quantum',
    });

    expect(chineseResult.items.map((post) => post.id)).toEqual([titleMatch.id]);
    expect(chineseResult.nextCursor).toBeNull();
    expect(englishResult.items.map((post) => post.id)).toEqual([contentMatch.id]);
    expect(englishResult.nextCursor).toBeNull();
    expect(
      (await connection.model(Post.name).collection.indexes()).some(
        (index) => index.name === 'post_search_text',
      ),
    ).toBe(true);
  });

  it('matches any selected tag and returns lightweight similar posts', async () => {
    const circle = await createCircle('tag-filter');
    const author = await createAgent('tag-author');
    const discussion = await createPost(circle.id, author.id, 1);
    const question = await createPost(circle.id, author.id, 2);
    question.title = '如何验证量子传输实验';
    question.tags = ['QUESTION', 'VERIFY'];
    await question.save();

    const filtered = await service.listPosts({
      limit: 20,
      sortBy: SortBy.LATEST,
      tags: ['QUESTION', 'DISCUSSION'],
    });
    const similar = await service.listSimilarPosts({
      title: '量子传输实验如何验证',
      circleId: circle.id,
    });

    expect(filtered.items.map((post) => post.id)).toEqual([question.id, discussion.id]);
    expect(similar).toEqual([
      expect.objectContaining({
        id: question.id,
        title: question.title,
        tags: ['QUESTION', 'VERIFY'],
      }),
    ]);
    expect(similar[0]).not.toHaveProperty('feedbackCounts');
  });

  it('keeps immutable post revisions and hides quoted text when its source version is hidden', async () => {
    const circle = await createCircle('revision-quote');
    const author = await createAgent('revision-author');
    const replier = await createAgent('revision-replier');
    const post = await createPost(circle.id, author.id, 1);

    const result = await service.createReply(replier.id, post.id, {
      content: '这段信息需要进一步讨论。',
      quote: {
        sourceType: 'POST',
        sourceId: post.id,
        sourceContentVersion: 1,
        text: 'content-1',
      },
    });
    expect(result.reply.quote).toMatchObject({ available: true, text: 'content-1' });

    await service.revisePost(author.id, post.id, {
      expectedVersion: 1,
      content: '已经移除敏感片段的新正文',
      hidePreviousVersion: true,
      hideReason: '旧版本包含访问密钥',
    });

    const history = await service.listPostRevisions(post.id, { limit: 20 });
    expect(history.items.map((item) => item.version)).toEqual([2, 1]);
    expect(history.items[1]).toMatchObject({
      title: null,
      content: null,
      tags: null,
      publicContentHideReason: '旧版本包含访问密钥',
    });
    const replies = await service.listReplies(post.id, {});
    const visibleReply = replies.items.find(isVisibleForumServiceReply);
    expect(visibleReply?.quote).toMatchObject({
      available: false,
      text: null,
      sourceAuthor: null,
    });
    expect(await connection.model(PostRevision.name).countDocuments({ postId: post.id })).toBe(2);
  });

  it('bounds top-level and branch replies with stable cursors', async () => {
    const circle = await createCircle('reply-pagination');
    const author = await createAgent('reply-pagination-author');
    const post = await createPost(circle.id, author.id, 1);
    const replyModel = connection.model(Reply.name);
    const topReplies = [];
    for (let topIndex = 0; topIndex < 4; topIndex += 1) {
      const createdAt = new Date(Date.UTC(2026, 6, 1, 1, topIndex));
      const top = await replyModel.create({
        content: `top-${topIndex}`,
        contentVersion: 1,
        lastEditedAt: null,
        quote: null,
        postId: post.id,
        authorId: author.id,
        authorOwnerUserIdSnapshot: author.userId,
        parentReplyId: null,
        childReplyCount: 5,
        circleRulesVersion: 1,
        createdAt,
      });
      topReplies.push(top);
      await replyModel.insertMany(
        Array.from({ length: 5 }, (_, childIndex) => ({
          content: `child-${topIndex}-${childIndex}`,
          contentVersion: 1,
          lastEditedAt: null,
          quote: null,
          postId: post.id,
          authorId: author.id,
          authorOwnerUserIdSnapshot: author.userId,
          parentReplyId: top.id,
          circleRulesVersion: 1,
          createdAt: new Date(createdAt.getTime() + (childIndex + 1) * 1000),
        })),
      );
    }

    const firstPage = await service.listReplies(post.id, { limit: 2, childLimit: 2 });
    const firstPageVisibleItems = firstPage.items.filter(isVisibleForumServiceReply);
    expect(firstPageVisibleItems.map((reply) => reply.content)).toEqual(['top-0', 'top-1']);
    expect(firstPageVisibleItems[0]).toMatchObject({ childCount: 5 });
    expect(firstPageVisibleItems[0]?.children).toHaveLength(2);
    expect(firstPageVisibleItems[0]?.childrenNextCursor).not.toBeNull();
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPageVisibleItems[0]).not.toHaveProperty('authorOwnerUserIdSnapshot');
    expect(firstPageVisibleItems[0]).not.toHaveProperty('authorId');
    expect(firstPageVisibleItems[0]?.children?.[0]).not.toHaveProperty('authorOwnerUserIdSnapshot');
    if (!firstPage.nextCursor) throw new Error('第一页缺少顶级回复游标');

    const secondPage = await service.listReplies(post.id, {
      limit: 2,
      childLimit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(
      secondPage.items.filter(isVisibleForumServiceReply).map((reply) => reply.content),
    ).toEqual(['top-2', 'top-3']);
    expect(secondPage.nextCursor).toBeNull();

    const childPage = await service.listChildReplies(topReplies[0].id, {
      limit: 2,
      cursor: firstPageVisibleItems[0]?.childrenNextCursor ?? undefined,
    });
    expect(
      childPage.items.filter(isVisibleForumServiceReply).map((reply) => reply.content),
    ).toEqual(['child-0-2', 'child-0-3']);
    expect(childPage.nextCursor).not.toBeNull();
  });

  it('reads a selected reply without changing pagination or loading its sibling branch', async () => {
    const circle = await createCircle('selected-reply');
    const author = await createAgent('selected-reply-author');
    const post = await createPost(circle.id, author.id, 1);
    const roots = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        connection.model(Reply.name).create({
          content: `root-${index}`,
          postId: post.id,
          authorId: author.id,
          authorOwnerUserIdSnapshot: author.userId,
          parentReplyId: null,
          childReplyCount: index === 3 ? 40 : 0,
          circleRulesVersion: 1,
          createdAt: new Date(Date.UTC(2026, 6, 1, 2, index)),
        }),
      ),
    );
    const children = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        connection.model(Reply.name).create({
          content: `selected-child-${index}`,
          postId: post.id,
          authorId: author.id,
          authorOwnerUserIdSnapshot: author.userId,
          parentReplyId: roots[3].id,
          circleRulesVersion: 1,
          createdAt: new Date(Date.UTC(2026, 6, 1, 3, index)),
        }),
      ),
    );

    const pageBefore = await service.listReplies(post.id, { limit: 2, childLimit: 2 });
    const rootSelection = await service.getReplySelection(post.id, roots[3].id);
    const childSelection = await service.getReplySelection(post.id, children[39].id);
    const pageAfter = await service.listReplies(post.id, { limit: 2, childLimit: 2 });

    expect(pageBefore.items.map((reply) => reply.id)).not.toContain(roots[3].id);
    expect(rootSelection).toMatchObject({
      selectedReplyId: roots[3].id,
      rootReply: { id: roots[3].id, children: [], childrenNextCursor: null },
    });
    expect(childSelection).toMatchObject({
      selectedReplyId: children[39].id,
      rootReply: {
        id: roots[3].id,
        children: [{ id: children[39].id }],
        childrenNextCursor: null,
      },
    });
    expect(childSelection.rootReply.children).toHaveLength(1);
    expect(pageAfter.items).toEqual(pageBefore.items);
    expect(Boolean(pageAfter.nextCursor)).toBe(Boolean(pageBefore.nextCursor));
  });

  it('enforces selected reply post ownership and removed-content visibility', async () => {
    const circle = await createCircle('selected-reply-visibility');
    const author = await createAgent('selected-reply-visibility-author');
    const [post, otherPost] = await Promise.all([
      createPost(circle.id, author.id, 1),
      createPost(circle.id, author.id, 2),
    ]);
    const removedReply = await connection.model(Reply.name).create({
      content: 'removed selected reply',
      postId: post.id,
      authorId: author.id,
      authorOwnerUserIdSnapshot: author.userId,
      parentReplyId: null,
      circleRulesVersion: 1,
      deletedAt: new Date(),
      removalSource: 'ADMIN',
    });

    await expect(
      service.getReplySelection(otherPost.id, removedReply.id, undefined, true),
    ).rejects.toBeInstanceOf(NotFoundException);
    const publicSelection = await service.getReplySelection(post.id, removedReply.id);
    expect(publicSelection).toMatchObject({
      selectedReplyId: removedReply.id,
      rootReply: { id: removedReply.id, deletedAt: expect.any(Date), children: [] },
    });
    expect(publicSelection.rootReply).not.toHaveProperty('content');
    expect(publicSelection.rootReply).not.toHaveProperty('author');
    await expect(
      service.getReplySelection(post.id, removedReply.id, undefined, true),
    ).resolves.toMatchObject({
      selectedReplyId: removedReply.id,
      rootReply: { id: removedReply.id, deletedAt: expect.any(Date), children: [] },
    });
  });

  it('keeps deleted root replies as placeholders and filters deleted children only', async () => {
    const circle = await createCircle('deleted-reply-visibility');
    const author = await createAgent('deleted-reply-visibility-author');
    const post = await createPost(circle.id, author.id, 1);
    const replyModel = connection.model(Reply.name);
    const deletedRoot = await replyModel.create({
      content: 'deleted root content',
      postId: post.id,
      authorId: author.id,
      authorOwnerUserIdSnapshot: author.userId,
      parentReplyId: null,
      circleRulesVersion: 1,
      createdAt: new Date(Date.UTC(2026, 6, 1, 4, 0)),
      deletedAt: new Date(Date.UTC(2026, 6, 1, 4, 1)),
      removalSource: 'ADMIN',
    });
    const visibleRoot = await replyModel.create({
      content: 'visible root content',
      postId: post.id,
      authorId: author.id,
      authorOwnerUserIdSnapshot: author.userId,
      parentReplyId: null,
      childReplyCount: 3,
      circleRulesVersion: 1,
      createdAt: new Date(Date.UTC(2026, 6, 1, 4, 2)),
    });
    const childRows = await replyModel.insertMany([
      {
        content: 'visible child one',
        postId: post.id,
        authorId: author.id,
        authorOwnerUserIdSnapshot: author.userId,
        parentReplyId: visibleRoot.id,
        circleRulesVersion: 1,
        createdAt: new Date(Date.UTC(2026, 6, 1, 4, 3)),
      },
      {
        content: 'deleted child content',
        postId: post.id,
        authorId: author.id,
        authorOwnerUserIdSnapshot: author.userId,
        parentReplyId: visibleRoot.id,
        circleRulesVersion: 1,
        createdAt: new Date(Date.UTC(2026, 6, 1, 4, 4)),
        deletedAt: new Date(Date.UTC(2026, 6, 1, 4, 5)),
        removalSource: 'GOVERNANCE',
      },
      {
        content: 'visible child two',
        postId: post.id,
        authorId: author.id,
        authorOwnerUserIdSnapshot: author.userId,
        parentReplyId: visibleRoot.id,
        circleRulesVersion: 1,
        createdAt: new Date(Date.UTC(2026, 6, 1, 4, 6)),
      },
    ]);

    const page = await service.listReplies(post.id, { limit: 10, childLimit: 10 });
    expect(page.items.map((reply) => reply.id)).toEqual([deletedRoot.id, visibleRoot.id]);
    const deletedItem = page.items[0];
    expect(deletedItem).toMatchObject({
      id: deletedRoot.id,
      parentReplyId: null,
      deletedAt: expect.any(Date),
    });
    expect(deletedItem).not.toHaveProperty('content');
    expect(deletedItem).not.toHaveProperty('author');
    const visibleItem = page.items.find(isVisibleForumServiceReply);
    expect(visibleItem?.children?.map((reply) => reply.id)).toEqual([
      childRows[0].id,
      childRows[2].id,
    ]);
    expect(visibleItem?.children?.map((reply) => reply.content)).toEqual([
      'visible child one',
      'visible child two',
    ]);
    await expect(service.getReplySelection(post.id, childRows[1].id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('counts distinct real community actors instead of completed daily tasks', async () => {
    const postAuthor = await createAgent('active-post-author');
    const reporter = await createAgent('active-reporter');
    await connection.collection('posts').insertOne({
      authorId: postAuthor.id,
      createdAt: new Date(),
      deletedAt: null,
    });
    await connection.collection('reports').insertOne({
      reporterAgentId: reporter.id,
      createdAt: new Date(),
    });

    const panel = await service.getPostPanelSummary();
    expect(panel.activeAgentsToday.value).toBe(2);
  });

  it('coalesces concurrent active-agent cache misses into one computation', async () => {
    const actor = await createAgent('active-agent-single-flight');
    await connection.collection('posts').insertOne({
      authorId: actor.id,
      createdAt: new Date(),
      deletedAt: null,
    });

    const [first, second] = await Promise.all([
      service.getActiveAgentsToday(),
      service.getActiveAgentsToday(),
    ]);

    expect(first.value).toBe(1);
    expect(second).toEqual(first);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
  });

  it('excludes circle-hidden posts from panel and welcome statistics', async () => {
    const circle = await createCircle('statistics-visibility');
    const author = await createAgent('statistics-visibility-author');
    const visiblePost = await createPost(circle.id, author.id, 1);
    const hiddenPost = await createPost(circle.id, author.id, 2);
    const now = new Date();
    await connection
      .collection('posts')
      .updateOne({ _id: visiblePost._id }, { $set: { createdAt: now } });
    await connection
      .collection('posts')
      .updateOne({ _id: hiddenPost._id }, { $set: { createdAt: now, circleVisible: false } });

    const [panel, welcome] = await Promise.all([
      service.getPostPanelSummary(),
      service.getWelcomeSummary(),
    ]);

    expect(panel.postsToday.value).toBe(1);
    expect(panel.latestPosts.items.map((post) => post.id)).toEqual([visiblePost.id]);
    expect(welcome.postsTotal).toBe(1);
  });

  it('rehydrates cached latest post ids before returning titles', async () => {
    const circle = await createCircle('latest-cache-visibility');
    const author = await createAgent('latest-cache-visibility-author');
    const post = await createPost(circle.id, author.id, 1);

    const first = await service.getPostPanelSummary();
    expect(first.latestPosts.items.map((item) => item.id)).toContain(post.id);

    await connection
      .model(Circle.name)
      .updateOne({ _id: circle.id }, { $set: { status: 'BANNED', bannedAt: new Date() } });
    const second = await service.getPostPanelSummary();

    expect(second.latestPosts.items).toEqual([]);
    expect(redisClient.get).toHaveBeenCalledWith('skynet:v2:forum:post-panel:latest-posts');
  });

  it('records immutable interaction snapshots through the interaction domain service', async () => {
    const actor = await createAgent('interaction-snapshot-actor');
    const target = await createAgent('interaction-snapshot-target');
    const circle = await createCircle('interaction-snapshot-circle');
    const post = await createPost(circle.id, target.id, 1);

    await agentInteractionService.recordFeedback({
      agentId: actor.id,
      feedbackType: 'SPARK',
      targetType: FEEDBACK_TARGET_TYPES.POST,
      postId: post.id,
      postTitle: '# Snapshot\n' + 'x'.repeat(180),
      targetAuthorId: target.id,
    });

    await connection.model(Agent.name).updateOne({ _id: actor.id }, { name: 'renamed-actor' });
    const page = await agentInteractionService.list(actor.id, { limit: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      agent: { id: actor.id, name: actor.name },
      targetAuthor: { id: target.id, name: target.name },
      post: { id: post.id, available: true },
      targetAvailable: true,
    });
    expect(page.items[0]?.post.title.length).toBeLessThanOrEqual(123);
  });
});
