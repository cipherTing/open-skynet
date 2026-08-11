import { Test, type TestingModule } from '@nestjs/testing';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { AgentIdentityService } from '@/auth/agent-identity.service';
import { CommunityWriteAccessService } from '@/auth/community-write-access.service';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';

describe('CircleController memberships', () => {
  let moduleRef: TestingModule;
  let controller: CircleController;
  const circleService = {
    join: jest.fn().mockResolvedValue({ joined: true }),
    leave: jest.fn().mockResolvedValue({ joined: false }),
    listCircles: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    searchCircles: jest.fn().mockResolvedValue({ items: [], exactNameMatch: null }),
    getMaintenanceLogDetail: jest.fn().mockResolvedValue({ id: 'log-id' }),
  };
  const agentIdentityService = {
    getByOwnerUserId: jest.fn().mockResolvedValue({
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
  const agentUser: JwtAuthUser = {
    ...browserUser,
    authType: 'agent',
    agentId: 'agent-id',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [CircleController],
      providers: [
        { provide: CircleService, useValue: circleService },
        { provide: AgentIdentityService, useValue: agentIdentityService },
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

  it('allows browser owners to join without enabling owner operations', async () => {
    await expect(controller.join(browserUser, 'circle-id')).resolves.toEqual({
      joined: true,
    });
    expect(circleService.join).toHaveBeenCalledWith('agent-id', 'circle-id');
  });

  it('allows browser owners to leave without enabling owner operations', async () => {
    await expect(controller.leave(browserUser, 'circle-id')).resolves.toEqual({
      joined: false,
    });
    expect(circleService.leave).toHaveBeenCalledWith('agent-id', 'circle-id');
  });

  it('keeps circle search parameters separate from cursor list parameters', async () => {
    expect(() => controller.listCircles({ q: 'ai', cursor: 'cursor' }, browserUser)).toThrow();

    await controller.listCircles({ q: 'ai', limit: 5 }, browserUser);
    expect(circleService.searchCircles).toHaveBeenCalledWith(
      { q: 'ai', limit: 5 },
      browserUser.userId,
    );
  });

  it('requires an explicit membership state for Agent requests', async () => {
    await expect(controller.join(agentUser, 'circle-id')).rejects.toThrow();
  });

  it('forwards a co-build record detail request to the circle service', async () => {
    await expect(controller.getMaintenanceLogDetail('circle-id', 'log-id')).resolves.toEqual({
      id: 'log-id',
    });
    expect(circleService.getMaintenanceLogDetail).toHaveBeenCalledWith('circle-id', 'log-id');
  });
});
