import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Agent } from '@/database/schemas/agent.schema';
import { ProgressionService } from '@/progression/progression.service';
import type {
  JwtAgentAuthUser,
  JwtBrowserAuthUser,
} from '@/auth/interfaces/jwt-auth-user.interface';
import { UserController } from './user.controller';
import { UserService } from './user.service';

describe('UserController Agent Key boundaries', () => {
  let moduleRef: TestingModule;
  let controller: UserController;
  const userService = {
    updateAgent: jest.fn(),
    regenerateKey: jest.fn(),
    createGuideLink: jest.fn(),
  };
  const progressionService = { getCurrentAgentProgression: jest.fn() };
  const agentModel = { findOne: jest.fn(), findById: jest.fn() };
  const browserUser: JwtBrowserAuthUser = {
    userId: 'owner-1',
    username: 'owner',
    authType: 'jwt',
    dbTokenVersion: 0,
    payloadTokenVersion: 0,
    role: 'USER',
  };
  const agentUser: JwtAgentAuthUser = {
    ...browserUser,
    authType: 'agent',
    agentId: 'agent-1',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: ProgressionService, useValue: progressionService },
        { provide: getModelToken(Agent.name), useValue: agentModel },
      ],
    }).compile();
    controller = moduleRef.get(UserController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    agentModel.findOne.mockResolvedValue({ id: 'agent-owned-by-owner-1' });
    agentModel.findById.mockResolvedValue({ id: 'agent-1' });
    userService.updateAgent.mockResolvedValue({ id: 'agent-1', name: 'Renamed' });
    userService.regenerateKey.mockResolvedValue({ secretKey: '[REDACTED]' });
    userService.createGuideLink.mockResolvedValue({ url: 'https://example.test/guide.md' });
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('rejects Agent credentials before accessing Owner Key operations', async () => {
    await expect(controller.regenerateKey(agentUser)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.createGuideLink(agentUser)).rejects.toBeInstanceOf(ForbiddenException);
    expect(agentModel.findOne).not.toHaveBeenCalled();
    expect(userService.regenerateKey).not.toHaveBeenCalled();
    expect(userService.createGuideLink).not.toHaveBeenCalled();
  });

  it('allows an Agent Key to update its own public name and description', async () => {
    const dto = { name: 'Renamed', description: '' };
    await expect(controller.updateAgent(agentUser, dto)).resolves.toEqual({
      id: 'agent-1',
      name: 'Renamed',
    });
    expect(agentModel.findById).toHaveBeenCalledWith(agentUser.agentId);
    expect(userService.updateAgent).toHaveBeenCalledWith('agent-1', dto);
  });

  it('rejects Owner-only settings from an Agent Key', async () => {
    await expect(
      controller.updateAgent(agentUser, { favoritesPublic: false }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'AGENT_PROFILE_FIELDS_FORBIDDEN' },
    });
    await expect(
      controller.updateAgent(agentUser, { ownerOperationEnabled: true }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: 'AGENT_PROFILE_FIELDS_FORBIDDEN' },
    });
    expect(agentModel.findById).not.toHaveBeenCalled();
    expect(userService.updateAgent).not.toHaveBeenCalled();
  });

  it('resolves the browser user own Agent before rotating its Key', async () => {
    await controller.regenerateKey(browserUser);
    expect(agentModel.findOne).toHaveBeenCalledWith({ userId: browserUser.userId });
    expect(userService.regenerateKey).toHaveBeenCalledWith('agent-owned-by-owner-1');
  });

  it('resolves the browser user own Agent before generating its Guide link', async () => {
    await controller.createGuideLink(browserUser);
    expect(agentModel.findOne).toHaveBeenCalledWith({ userId: browserUser.userId });
    expect(userService.createGuideLink).toHaveBeenCalledWith('agent-owned-by-owner-1', 6);
  });

  it('forwards the chosen revisit interval to the Guide link service', async () => {
    await controller.createGuideLink(browserUser, { revisitIntervalHours: 24 });
    expect(userService.createGuideLink).toHaveBeenCalledWith('agent-owned-by-owner-1', 24);
  });
});
