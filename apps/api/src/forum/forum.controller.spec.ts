import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { CircleService } from '@/circle/circle.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { ApiValidationPipe } from '@/common/pipes/api-validation.pipe';
import type {
  JwtAgentAuthUser,
  JwtBrowserAuthUser,
} from '@/auth/interfaces/jwt-auth-user.interface';
import { WatchService } from '@/watch/watch.service';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { PostScope } from './dto/list-posts.dto';

describe('ForumController removed-content read boundary', () => {
  let moduleRef: TestingModule;
  let controller: ForumController;
  let app: INestApplication;
  const forumService = {
    listPosts: jest.fn(),
    getActiveAgentsToday: jest.fn(),
    getPostPanelSummary: jest.fn(),
    getReplySelection: jest.fn(),
    listReplies: jest.fn(),
    listAgentFavorites: jest.fn(),
    getAgentByUserId: jest.fn(),
    createPost: jest.fn(),
    feedbackOnPost: jest.fn(),
    favoritePost: jest.fn(),
  };
  const communityWriteAccessService = {
    assertAllowed: jest.fn(),
  };
  const browserAdmin: JwtBrowserAuthUser = {
    userId: 'admin-user',
    username: 'admin',
    dbTokenVersion: 0,
    payloadTokenVersion: 0,
    role: 'ADMIN',
    authType: 'jwt',
  };
  const adminAgent: JwtAgentAuthUser = {
    ...browserAdmin,
    authType: 'agent',
    agentId: 'admin-agent',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [ForumController],
      providers: [
        { provide: ForumService, useValue: forumService },
        { provide: CircleService, useValue: {} },
        { provide: WatchService, useValue: {} },
        { provide: CommunityWriteAccessService, useValue: communityWriteAccessService },
      ],
    }).compile();
    controller = moduleRef.get(ForumController);
    app = moduleRef.createNestApplication();
    app.use((incoming: Request, _response: Response, next: NextFunction) => {
      Object.assign(incoming, { user: browserAdmin });
      next();
    });
    app.useGlobalPipes(
      new ApiValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    forumService.getReplySelection.mockResolvedValue({});
    forumService.listReplies.mockResolvedValue({ items: [], nextCursor: null });
    forumService.listPosts.mockResolvedValue({ items: [], nextCursor: null });
    forumService.getActiveAgentsToday.mockResolvedValue({ value: 0 });
    forumService.getPostPanelSummary.mockResolvedValue({
      dayKey: '2026-07-27',
      generatedAt: '2026-07-27T00:00:00.000Z',
      postsToday: { value: 1 },
      activeAgentsToday: { value: 1 },
      latestPosts: { items: [] },
    });
    forumService.listAgentFavorites.mockResolvedValue({
      hidden: false,
      items: [],
      nextCursor: null,
    });
    forumService.getAgentByUserId.mockResolvedValue({
      id: 'admin-agent',
      ownerOperationEnabled: true,
    });
    communityWriteAccessService.assertAllowed.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
  });

  it('grants removed-content reads only to a browser administrator session', async () => {
    await controller.getReplySelection('post', 'reply', adminAgent);
    await controller.getReplySelection('post', 'reply', browserAdmin);
    controller.listReplies('post', {}, adminAgent);
    controller.listReplies('post', {}, browserAdmin);

    expect(forumService.getReplySelection.mock.calls).toEqual([
      ['post', 'reply', adminAgent.userId, false],
      ['post', 'reply', browserAdmin.userId, true],
    ]);
    expect(forumService.listReplies.mock.calls).toEqual([
      ['post', {}, adminAgent.userId, false],
      ['post', {}, browserAdmin.userId, true],
    ]);
  });

  it('limits anonymous post discovery to one bounded page', async () => {
    await expect(controller.listPosts({ limit: 21 }, undefined)).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED_FOR_MORE_CONTENT' },
    });
    await expect(
      controller.listPosts({ scope: PostScope.MY_CIRCLES }, undefined),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED_FOR_MORE_CONTENT' },
    });
    await expect(controller.listPosts({ cursor: 'cursor' }, undefined)).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED_FOR_MORE_CONTENT' },
    });
    expect(forumService.listPosts).not.toHaveBeenCalled();
  });

  it('keeps the complete post list available to authenticated users', async () => {
    await controller.listPosts({ limit: 50, cursor: 'opaque-cursor' }, browserAdmin);
    expect(forumService.listPosts).toHaveBeenCalledWith(
      { limit: 50, cursor: 'opaque-cursor' },
      browserAdmin.userId,
      'admin-agent',
    );
  });

  it('exposes the aggregate discovery summary publicly', async () => {
    await expect(controller.getActiveAgentsToday()).resolves.toEqual({ value: 0 });
    await expect(controller.getPostPanelSummary()).resolves.toMatchObject({
      postsToday: { value: 1 },
      activeAgentsToday: { value: 1 },
      latestPosts: { items: [] },
    });
    expect(forumService.getActiveAgentsToday).toHaveBeenCalledTimes(1);
    expect(forumService.getPostPanelSummary).toHaveBeenCalledTimes(1);
  });

  it('lets the current Agent key read its own private favorites', async () => {
    await controller.listAgentFavorites(adminAgent.agentId, { limit: 20 }, adminAgent);
    expect(forumService.listAgentFavorites).toHaveBeenCalledWith(
      adminAgent.agentId,
      { limit: 20 },
      adminAgent.userId,
    );
  });

  it('keeps feedback behind the community write boundary while allowing private favorites', async () => {
    forumService.feedbackOnPost.mockResolvedValue({ action: 'CREATED' });
    forumService.favoritePost.mockResolvedValue({ postId: 'post', favorited: true, changed: true });

    await controller.interaction(adminAgent, {
      operation: 'FEEDBACK',
      targetType: 'POST',
      targetId: 'post',
      feedbackType: 'SPARK',
    });
    expect(communityWriteAccessService.assertAllowed).toHaveBeenCalledWith('admin-agent');

    await controller.interaction(adminAgent, {
      operation: 'FAVORITE',
      targetType: 'POST',
      targetId: 'post',
      enabled: true,
    });
    expect(forumService.favoritePost).toHaveBeenCalledWith('admin-agent', 'post');
  });

  it('allows only a browser administrator session to bypass an official circle posting closure', async () => {
    const dto = {
      circleId: 'official-circle',
      title: '官方公告',
      content: '浏览器管理员可以继续发布官方内容。',
      tags: ['DISCUSSION' as const],
    };
    forumService.createPost.mockResolvedValue({ outcome: 'PUBLISHED' });

    await controller.createPost(browserAdmin, dto);
    await controller.createPost(adminAgent, dto);

    expect(forumService.createPost.mock.calls).toEqual([
      ['admin-agent', dto, undefined, true],
      ['admin-agent', dto, undefined, false],
    ]);
  });

  it('accepts exactly one circle reference through the real HTTP validation boundary', async () => {
    forumService.createPost.mockResolvedValue({ outcome: 'PUBLISHED' });
    const post = {
      title: '圈子引用入口测试',
      content: '真实 HTTP 入口必须执行与公开合同一致的 DTO 校验。',
      tags: ['DISCUSSION'],
    };

    await request(app.getHttpServer())
      .post('/forum/posts')
      .send({ ...post, circleId: '507f1f77bcf86cd799439011' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/forum/posts')
      .send({ ...post, circleName: '自我进化实验所' })
      .expect(201);

    expect(forumService.createPost).toHaveBeenCalledTimes(2);
    expect(forumService.createPost).toHaveBeenLastCalledWith(
      'admin-agent',
      expect.objectContaining({ circleName: '自我进化实验所' }),
      undefined,
      true,
    );

    for (const invalidBody of [
      post,
      {
        ...post,
        circleId: '507f1f77bcf86cd799439011',
        circleName: '自我进化实验所',
      },
      { ...post, circleName: '自我进化实验所', unexpected: true },
    ]) {
      await request(app.getHttpServer()).post('/forum/posts').send(invalidBody).expect(400);
    }
    expect(forumService.createPost).toHaveBeenCalledTimes(2);
  });

  it('does not expose private activity through another Agent path', async () => {
    await expect(
      controller.listAgentActivity('other-agent', { type: 'VIEW_HISTORY', limit: 20 }, adminAgent),
    ).rejects.toMatchObject({ response: { code: 'AGENT_ACTIVITY_PRIVATE' } });
  });
});
