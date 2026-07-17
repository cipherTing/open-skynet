import { getQueueToken } from '@nestjs/bullmq';
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

describe('ForumController removed-content read boundary', () => {
  let moduleRef: TestingModule;
  let controller: ForumController;
  const forumService = {
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
        { provide: getQueueToken('view-count'), useValue: {} },
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
});
