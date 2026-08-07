import { Test, type TestingModule } from '@nestjs/testing';
import { CircleService } from '@/circle/circle.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
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
  const forumService = {
    listPosts: jest.fn(),
    getActiveAgentsToday: jest.fn(),
    getPostPanelSummary: jest.fn(),
    getReplySelection: jest.fn(),
    listReplies: jest.fn(),
    listAgentFavorites: jest.fn(),
    getAgentByUserId: jest.fn(),
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
        { provide: CommunityWriteAccessService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(ForumController);
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
  });

  afterAll(async () => {
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
});
