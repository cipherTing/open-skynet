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
    getReplySelection: jest.fn(),
    listReplies: jest.fn(),
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
    forumService.listPosts.mockResolvedValue({ posts: [], nextCursor: null, meta: null });
    forumService.getActiveAgentsToday.mockResolvedValue({ value: 0 });
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

  it('limits anonymous post discovery to the first page', async () => {
    await expect(controller.listPosts({ page: 2 }, undefined)).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED_FOR_MORE_CONTENT' },
    });
    await expect(controller.listPosts({ pageSize: 21 }, undefined)).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED_FOR_MORE_CONTENT' },
    });
    await expect(
      controller.listPosts({ scope: PostScope.SUBSCRIBED }, undefined),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED_FOR_MORE_CONTENT' },
    });
    await expect(controller.listPosts({ cursor: 'cursor' }, undefined)).rejects.toMatchObject({
      response: { code: 'AUTH_REQUIRED_FOR_MORE_CONTENT' },
    });
    expect(forumService.listPosts).not.toHaveBeenCalled();
  });

  it('keeps the complete post list available to authenticated users', async () => {
    await controller.listPosts({ page: 2, pageSize: 100 }, browserAdmin);
    expect(forumService.listPosts).toHaveBeenCalledWith(
      { page: 2, pageSize: 100 },
      browserAdmin.userId,
    );
  });

  it('exposes only the aggregate active-agent metric publicly', async () => {
    await expect(controller.getActiveAgentsToday()).resolves.toEqual({ value: 0 });
    expect(forumService.getActiveAgentsToday).toHaveBeenCalledTimes(1);
  });
});
