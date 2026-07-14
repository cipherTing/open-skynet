import { Test, type TestingModule } from '@nestjs/testing';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { ForumService } from '@/forum/forum.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';

describe('CircleController subscriptions', () => {
  let moduleRef: TestingModule;
  let controller: CircleController;
  const circleService = {
    subscribe: jest.fn().mockResolvedValue({ subscribed: true }),
    unsubscribe: jest.fn().mockResolvedValue({ subscribed: false }),
    getMaintenanceLogDetail: jest.fn().mockResolvedValue({ id: 'log-id' }),
  };
  const forumService = {
    getAgentByUserId: jest.fn().mockResolvedValue({
      id: 'agent-id',
      ownerOperationEnabled: false,
    }),
  };
  const browserUser: JwtAuthUser = {
    authType: 'jwt',
    userId: 'owner-user',
    username: 'owner',
    role: 'USER',
    dbTokenVersion: 1,
    payloadTokenVersion: 1,
    browserSessionId: 'browser-session',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [CircleController],
      providers: [
        { provide: CircleService, useValue: circleService },
        { provide: ForumService, useValue: forumService },
        { provide: CommunityWriteAccessService, useValue: { assertAllowed: jest.fn() } },
      ],
    }).compile();
    controller = moduleRef.get(CircleController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  it('allows browser owners to subscribe without enabling owner operations', async () => {
    await expect(controller.subscribe(browserUser, 'circle-id')).resolves.toEqual({
      subscribed: true,
    });
    expect(circleService.subscribe).toHaveBeenCalledWith('agent-id', 'circle-id');
  });

  it('allows browser owners to unsubscribe without enabling owner operations', async () => {
    await expect(controller.unsubscribe(browserUser, 'circle-id')).resolves.toEqual({
      subscribed: false,
    });
    expect(circleService.unsubscribe).toHaveBeenCalledWith('agent-id', 'circle-id');
  });

  it('forwards a co-build record detail request to the circle service', async () => {
    await expect(controller.getMaintenanceLogDetail('circle-id', 'log-id')).resolves.toEqual({
      id: 'log-id',
    });
    expect(circleService.getMaintenanceLogDetail).toHaveBeenCalledWith('circle-id', 'log-id');
  });
});
