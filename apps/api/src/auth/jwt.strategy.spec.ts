import { Test } from '@nestjs/testing';
import { AuthService, type ActiveBrowserUser } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AgentBrowserSessionService, type ActiveAgentBrowserUser } from './agent-browser-session.service';

const ACTIVE_USER: ActiveBrowserUser = {
  id: '64f000000000000000000001',
  username: 'owner',
  role: 'USER',
  tokenVersion: 4,
  suspendedAt: null,
  suspendedUntil: null,
};

describe('JwtStrategy', () => {
  it('validates the browser session and user in one service operation', async () => {
    const authService = {
      findActiveBrowserUser: jest.fn().mockResolvedValue(ACTIVE_USER),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: authService },
        { provide: AgentBrowserSessionService, useValue: { findActiveAgentBrowserUser: jest.fn() } },
      ],
    }).compile();
    const strategy = moduleRef.get(JwtStrategy);

    await expect(
      strategy.validate({
        sub: ACTIVE_USER.id,
        username: ACTIVE_USER.username,
        tokenVersion: 4,
        browserSessionId: '64f000000000000000000002',
      }),
    ).resolves.toMatchObject({
      userId: ACTIVE_USER.id,
      dbTokenVersion: 4,
      payloadTokenVersion: 4,
      authType: 'jwt',
    });
    expect(authService.findActiveBrowserUser).toHaveBeenCalledTimes(1);
  });

  it('rejects an inactive browser session without additional lookups', async () => {
    const authService = {
      findActiveBrowserUser: jest.fn().mockResolvedValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: authService },
        { provide: AgentBrowserSessionService, useValue: { findActiveAgentBrowserUser: jest.fn() } },
      ],
    }).compile();
    const strategy = moduleRef.get(JwtStrategy);

    await expect(
      strategy.validate({
        sub: ACTIVE_USER.id,
        username: ACTIVE_USER.username,
        browserSessionId: '64f000000000000000000002',
      }),
    ).resolves.toBeNull();
    expect(authService.findActiveBrowserUser).toHaveBeenCalledTimes(1);
  });

  it('validates an Agent JWT only through its distinct Agent browser session', async () => {
    const activeAgent: ActiveAgentBrowserUser = {
      id: '64f000000000000000000002',
      username: 'owner',
      role: 'ADMIN',
      tokenVersion: 0,
      agentId: '64f000000000000000000001',
      suspendedAt: null,
      suspendedUntil: null,
    };
    const authService = { findActiveBrowserUser: jest.fn() };
    const agentBrowserSessionService = {
      findActiveAgentBrowserUser: jest.fn().mockResolvedValue(activeAgent),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: authService },
        { provide: AgentBrowserSessionService, useValue: agentBrowserSessionService },
      ],
    }).compile();
    const strategy = moduleRef.get(JwtStrategy);

    await expect(
      strategy.validate({
        sub: activeAgent.id,
        username: activeAgent.username,
        authType: 'agent',
        agentId: activeAgent.agentId,
        agentBrowserSessionId: '64f000000000000000000003',
      }),
    ).resolves.toMatchObject({
      userId: activeAgent.id,
      agentId: activeAgent.agentId,
      agentBrowserSessionId: '64f000000000000000000003',
      authType: 'agent',
      role: 'USER',
    });
    expect(agentBrowserSessionService.findActiveAgentBrowserUser).toHaveBeenCalledWith(
      activeAgent.agentId,
      '64f000000000000000000003',
    );
    expect(authService.findActiveBrowserUser).not.toHaveBeenCalled();
  });
});
