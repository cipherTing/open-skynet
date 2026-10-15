import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentBrowserSession } from '@/database/schemas/agent-browser-session.schema';
import { User } from '@/database/schemas/user.schema';
import { AgentKeyAuthService } from './agent-key-auth.service';
import { AgentBrowserSessionService } from './agent-browser-session.service';

const OWNER_ID = '64f000000000000000000002';
const AGENT_ID = '64f000000000000000000001';
const SESSION_ID = '64f000000000000000000003';

describe('AgentBrowserSessionService', () => {
  let moduleRef: TestingModule;
  let service: AgentBrowserSessionService;
  const agentSessionModel = {
    create: jest.fn(),
    aggregate: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const agentModel = { findOne: jest.fn(), collection: { name: 'agents' } };
  const userModel = { collection: { name: 'users' } };
  const agentKeyAuthService = { authenticate: jest.fn() };
  const jwtService = { sign: jest.fn() };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        AgentBrowserSessionService,
        { provide: getModelToken(AgentBrowserSession.name), useValue: agentSessionModel },
        { provide: getModelToken(Agent.name), useValue: agentModel },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: AgentKeyAuthService, useValue: agentKeyAuthService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();
    service = moduleRef.get(AgentBrowserSessionService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('exchanges a valid Agent Key for a separate persistent Agent session', async () => {
    agentKeyAuthService.authenticate.mockResolvedValue({
      userId: OWNER_ID,
      agentId: AGENT_ID,
      username: 'owner',
      role: 'ADMIN',
      authType: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
    });
    agentModel.findOne.mockResolvedValue({
      id: AGENT_ID,
      name: 'Story Agent',
      description: 'Writes stories',
      favoritesPublic: true,
      ownerOperationEnabled: true,
      avatarSeed: 'story-agent',
      secretKeyVersion: 4,
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
    });
    agentSessionModel.create.mockResolvedValue({ id: SESSION_ID });
    jwtService.sign.mockReturnValue('short-lived-agent-access-token');

    const result = await service.loginWithAgentKey('sk_live_valid_key');

    expect(result).toMatchObject({
      sessionType: 'AGENT',
      user: null,
      agent: { id: AGENT_ID, name: 'Story Agent', ownerOperationEnabled: false },
      token: 'short-lived-agent-access-token',
    });
    expect(result.refreshToken).toMatch(/^sk_agt_rt_v1\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/u);
    expect(agentSessionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: AGENT_ID,
        userId: OWNER_ID,
        agentKeyVersion: 4,
        refreshTokenVersion: 1,
        currentTokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        absoluteExpiresAt: expect.any(Date),
      }),
    );
    expect(agentSessionModel.create.mock.calls[0][0]).not.toHaveProperty('key');
    expect(agentSessionModel.create.mock.calls[0][0]).not.toHaveProperty('refreshToken');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: OWNER_ID,
        agentId: AGENT_ID,
        agentBrowserSessionId: SESSION_ID,
        authType: 'agent',
        role: 'USER',
      }),
    );
  });

  it('rejects an invalid Agent Key without creating a session', async () => {
    agentKeyAuthService.authenticate.mockResolvedValue(null);

    await expect(service.loginWithAgentKey('sk_live_invalid_key')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    });
    expect(agentSessionModel.create).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('resolves an active Agent identity only from its Agent session record', async () => {
    agentSessionModel.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          id: OWNER_ID,
          username: 'owner',
          role: 'USER',
          agentId: AGENT_ID,
          suspendedAt: null,
          suspendedUntil: null,
        },
      ]),
    });

    await expect(service.findActiveAgentBrowserUser(AGENT_ID, SESSION_ID)).resolves.toMatchObject({
      id: OWNER_ID,
      username: 'owner',
      agentId: AGENT_ID,
      role: 'USER',
    });
    expect(agentSessionModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            _id: expect.anything(),
            agentId: AGENT_ID,
            revokedAt: null,
          }),
        }),
      ]),
    );
  });

  it('rotates an Agent refresh token while retaining its selector and issuing an Agent JWT', async () => {
    const selector = 'A'.repeat(32);
    const secret = 'B'.repeat(43);
    const selectorHash = createHash('sha256').update(selector).digest('hex');
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const expiresAt = new Date('2026-10-21T00:00:00.000Z');
    const absoluteExpiresAt = new Date('2026-11-13T00:00:00.000Z');
    agentSessionModel.findOne.mockResolvedValue({
      id: SESSION_ID,
      agentId: AGENT_ID,
      userId: OWNER_ID,
      selectorHash,
      rotationVersion: 0,
      currentTokenHash: secretHash,
      expiresAt,
      absoluteExpiresAt,
    });
    agentSessionModel.findOneAndUpdate.mockImplementation(
      async (_filter: unknown, update: { $set: Record<string, unknown> }) => ({
        id: SESSION_ID,
        agentId: AGENT_ID,
        userId: OWNER_ID,
        expiresAt: update.$set.expiresAt,
        absoluteExpiresAt,
      }),
    );
    agentSessionModel.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          id: OWNER_ID,
          username: 'owner',
          role: 'USER',
          agentId: AGENT_ID,
          tokenVersion: 0,
          suspendedAt: null,
          suspendedUntil: null,
        },
      ]),
    });
    agentModel.findOne.mockResolvedValue({
      id: AGENT_ID,
      name: 'Story Agent',
      description: '',
      favoritesPublic: true,
      ownerOperationEnabled: true,
      avatarSeed: 'story-agent',
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
    });
    jwtService.sign.mockReturnValue('refreshed-agent-access-token');

    const result = await service.refreshAgentBrowserSession(
      `sk_agt_rt_v1.${selector}.${secret}`,
    );

    expect(result.refreshToken).toMatch(new RegExp(`^sk_agt_rt_v1\\.${selector}\\.[A-Za-z0-9_-]{43}$`, 'u'));
    expect(result.refreshToken).not.toBe(`sk_agt_rt_v1.${selector}.${secret}`);
    expect(result.token).toBe('refreshed-agent-access-token');
    expect(result.agent.ownerOperationEnabled).toBe(false);
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ authType: 'agent', agentId: AGENT_ID }),
    );
  });

  it('revokes only the session named by a valid Agent refresh cookie', async () => {
    const selector = 'C'.repeat(32);
    const secret = 'D'.repeat(43);

    await service.logoutAgentBrowserSession(`sk_agt_rt_v1.${selector}.${secret}`);

    expect(agentSessionModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorHash: createHash('sha256').update(selector).digest('hex'),
        refreshTokenVersion: 1,
        revokedAt: null,
        $or: expect.arrayContaining([
          expect.objectContaining({
            currentTokenHash: createHash('sha256').update(secret).digest('hex'),
          }),
          expect.objectContaining({
            previousTokenHash: createHash('sha256').update(secret).digest('hex'),
          }),
        ]),
      }),
      { $set: { revokedAt: expect.any(Date) } },
    );
  });

  it('revokes and rejects an Agent refresh when the owning user is suspended', async () => {
    const selector = 'E'.repeat(32);
    const secret = 'F'.repeat(43);
    const selectorHash = createHash('sha256').update(selector).digest('hex');
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const expiresAt = new Date(Date.now() + 60_000);
    agentSessionModel.findOne.mockResolvedValue({
      id: SESSION_ID,
      agentId: AGENT_ID,
      userId: OWNER_ID,
      selectorHash,
      rotationVersion: 0,
      currentTokenHash: secretHash,
      expiresAt,
      absoluteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    agentSessionModel.findOneAndUpdate.mockResolvedValue({
      id: SESSION_ID,
      agentId: AGENT_ID,
      userId: OWNER_ID,
      expiresAt,
      absoluteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    agentSessionModel.aggregate.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          id: OWNER_ID,
          username: 'owner',
          role: 'USER',
          agentId: AGENT_ID,
          tokenVersion: 0,
          suspendedAt: new Date(Date.now() - 60_000),
          suspendedUntil: null,
        },
      ]),
    });

    await expect(
      service.refreshAgentBrowserSession(`sk_agt_rt_v1.${selector}.${secret}`),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }),
    });
    expect(agentSessionModel.findByIdAndUpdate).toHaveBeenCalledWith(SESSION_ID, {
      revokedAt: expect.any(Date),
    });
    expect(agentModel.findOne).not.toHaveBeenCalled();
  });
});
