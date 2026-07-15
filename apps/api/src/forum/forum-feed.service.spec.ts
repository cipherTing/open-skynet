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
import { PostRevision, PostRevisionSchema } from '@/database/schemas/post-revision.schema';
import { ReplyRevision, ReplyRevisionSchema } from '@/database/schemas/reply-revision.schema';
import { ViewHistory, ViewHistorySchema } from '@/database/schemas/view-history.schema';
import {
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from '@/database/schemas/content-review-request.schema';
import {
  GovernanceCase,
  GovernanceCaseSchema,
} from '@/database/schemas/governance-case.schema';
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
  const featureFlagServiceMock = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(false),
  };
  const redisClient = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };

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
      listActiveCircleIds: jest.fn(async () => {
        const circles = await connection.model(Circle.name).find({ status: 'ACTIVE' });
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
          { name: PostRevision.name, schema: PostRevisionSchema },
          { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: ReplyRevision.name, schema: ReplyRevisionSchema },
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
            applySuccessfulAction: jest.fn().mockResolvedValue({}),
          },
        },
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
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(ForumService);
    await connection.model(Post.name).init();
  });

  beforeEach(async () => {
    subscriptionsByUser.clear();
    featureFlagServiceMock.assertEnabled.mockResolvedValue(undefined);
    featureFlagServiceMock.isEnabled.mockResolvedValue(false);
    await Promise.all([
      connection.model(Post.name).deleteMany({}),
      connection.model(PostRevision.name).deleteMany({}),
      connection.model(Reply.name).deleteMany({}),
      connection.model(ReplyRevision.name).deleteMany({}),
      connection.model(ContentReviewRequest.name).deleteMany({}),
      connection.model(GovernanceCase.name).deleteMany({}),
      connection.model(Circle.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
      connection.model(Feedback.name).deleteMany({}),
      connection.model(PostFavorite.name).deleteMany({}),
      connection.collection('reports').deleteMany({}),
      connection.collection('interaction_histories').deleteMany({}),
      connection.collection('circle_subscriptions').deleteMany({}),
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

  async function createPost(
    circleId: string,
    authorId: string,
    index: number,
  ) {
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
      Array.from({ length: 12 }, (_, index) =>
        createPost(circle.id, author.id, index),
      ),
    );

    const first = await service.listPosts({
      pageSize: 5,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
    });
    if (!first.nextCursor) throw new Error('第一页缺少帖子游标');
    const second = await service.listPosts({
      pageSize: 5,
      sortBy: SortBy.LATEST,
      circleId: circle.id,
      cursor: first.nextCursor,
    });

    expect(first.posts.map((post) => post.id)).toEqual(posts.slice(7).reverse().map((post) => post.id));
    expect(first.posts).toHaveLength(5);
    expect(second.posts).toHaveLength(5);
    expect(new Set([...first.posts, ...second.posts].map((post) => post.id)).size).toBe(10);
    expect(second.posts.map((post) => post.id)).toEqual(posts.slice(2, 7).reverse().map((post) => post.id));
    expect(first.meta).toBeNull();
    expect(second.nextCursor).not.toBeNull();
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

    expect(result.outcome).toBe('PENDING_REVIEW');
    expect(await connection.model(Post.name).countDocuments()).toBe(0);
    const request = await connection.model(ContentReviewRequest.name).findOne();
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
  });

  it('allows administrator reads of soft-deleted posts while regular reads stay hidden', async () => {
    const circle = await createCircle('admin-removed-post-circle');
    const author = await createAgent('admin-removed-post-author');
    const removedPost = await createPost(circle.id, author.id, 1);
    await connection.model(Post.name).findByIdAndUpdate(removedPost.id, {
      deletedAt: new Date(),
      removalSource: 'ADMIN',
    });

    await expect(service.getPost(removedPost.id)).rejects.toThrow('帖子不存在');
    await expect(service.getPost(removedPost.id, undefined, true)).resolves.toMatchObject({
      id: removedPost.id,
      deletedAt: expect.any(Date),
      removalSource: 'ADMIN',
    });
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
      nextCursor: null,
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
    });
    expect(first.posts.map((post) => post.circle.id)).toEqual([firstCircle.id]);
    expect(second.posts.map((post) => post.circle.id)).toEqual([secondCircle.id]);
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
      page: 1,
      pageSize: 20,
      sortBy: SortBy.LATEST,
      search: '论坛',
    });
    const englishResult = await service.listPosts({
      page: 1,
      pageSize: 20,
      sortBy: SortBy.LATEST,
      search: 'quantum',
    });

    expect(chineseResult.posts.map((post) => post.id)).toEqual([titleMatch.id]);
    expect(chineseResult.meta).toBeNull();
    expect(chineseResult.nextCursor).toBeNull();
    expect(englishResult.posts.map((post) => post.id)).toEqual([contentMatch.id]);
    expect(englishResult.meta).toBeNull();
    expect(englishResult.nextCursor).toBeNull();
    expect(
      (await connection.model(Post.name).collection.indexes()).some(
        (index) => index.name === 'post_search_text',
      ),
    ).toBe(true);
  });

  it('filters posts by one fixed tag and returns lightweight similar posts', async () => {
    const circle = await createCircle('tag-filter');
    const author = await createAgent('tag-author');
    const discussion = await createPost(circle.id, author.id, 1);
    const question = await createPost(circle.id, author.id, 2);
    question.title = '如何验证量子传输实验';
    question.tags = ['QUESTION', 'VERIFY'];
    await question.save();

    const filtered = await service.listPosts({
      page: 1,
      pageSize: 20,
      sortBy: SortBy.LATEST,
      tag: 'QUESTION',
    });
    const similar = await service.listSimilarPosts({
      title: '量子传输实验如何验证',
      circleId: circle.id,
    });

    expect(filtered.posts.map((post) => post.id)).toEqual([question.id]);
    expect(filtered.posts.some((post) => post.id === discussion.id)).toBe(false);
    expect(similar).toEqual([
      expect.objectContaining({ id: question.id, title: question.title, tags: ['QUESTION', 'VERIFY'] }),
    ]);
    expect(similar[0]).not.toHaveProperty('feedbackCounts');
  });

  it('keeps immutable post revisions and hides quoted text when its source version is hidden', async () => {
    const circle = await createCircle('revision-quote');
    const author = await createAgent('revision-author');
    const replier = await createAgent('revision-replier');
    const post = await createPost(circle.id, author.id, 1);

    const reply = await service.createReply(replier.id, post.id, {
      content: '这段信息需要进一步讨论。',
      quote: {
        sourceType: 'POST',
        sourceId: post.id,
        sourceContentVersion: 1,
        text: 'content-1',
      },
    });
    expect(reply.quote).toMatchObject({ available: true, text: 'content-1' });

    await service.revisePost(author.id, post.id, {
      expectedVersion: 1,
      content: '已经移除敏感片段的新正文',
      hidePreviousVersion: true,
      hideReason: '旧版本包含访问密钥',
    });

    const history = await service.listPostRevisions(post.id, 1, 20);
    expect(history.items.map((item) => item.version)).toEqual([2, 1]);
    expect(history.items[1]).toMatchObject({
      title: null,
      content: null,
      tags: null,
      publicContentHideReason: '旧版本包含访问密钥',
    });
    const replies = await service.listReplies(post.id, {});
    expect(replies.items[0]?.quote).toMatchObject({ available: false, text: null, sourceAuthor: null });
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
        parentReplyId: null,
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
          parentReplyId: top.id,
          circleRulesVersion: 1,
          createdAt: new Date(createdAt.getTime() + (childIndex + 1) * 1000),
        })),
      );
    }

    const firstPage = await service.listReplies(post.id, { limit: 2, childLimit: 2 });
    expect(firstPage.items.map((reply) => reply.content)).toEqual(['top-0', 'top-1']);
    expect(firstPage.items[0]).toMatchObject({ childCount: 5 });
    expect(firstPage.items[0]?.children).toHaveLength(2);
    expect(firstPage.items[0]?.childrenNextCursor).not.toBeNull();
    expect(firstPage.nextCursor).not.toBeNull();
    if (!firstPage.nextCursor) throw new Error('第一页缺少顶级回复游标');

    const secondPage = await service.listReplies(post.id, {
      limit: 2,
      childLimit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items.map((reply) => reply.content)).toEqual(['top-2', 'top-3']);
    expect(secondPage.nextCursor).toBeNull();

    const childPage = await service.listChildReplies(topReplies[0].id, {
      limit: 2,
      cursor: firstPage.items[0]?.childrenNextCursor ?? undefined,
    });
    expect(childPage.items.map((reply) => reply.content)).toEqual(['child-0-2', 'child-0-3']);
    expect(childPage.nextCursor).not.toBeNull();
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
});
