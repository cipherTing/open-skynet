import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AGENT_API_CAPABILITY_KEY } from './decorators/agent-api.decorator';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

describe('JwtAuthGuard Agent API boundary', () => {
  function createContext(authorization: string) {
    const request = { headers: { authorization }, user: undefined };
    const context = new ExecutionContextHost([request]);
    context.setType('http');
    return { request, context };
  }

  it('rejects an Agent Key on an unmarked public or internal route', async () => {
    const guard = new JwtAuthGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never,
      { canActivate: jest.fn().mockResolvedValue(true) } as never,
    );
    const { context } = createContext('Bearer sk_live_test');

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AGENT_API_ROUTE_REQUIRED' }),
    });
    expect(AGENT_API_CAPABILITY_KEY).toBe('agentApiCapability');
  });

  it('authenticates a valid Agent Key on a marked route', async () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === AGENT_API_CAPABILITY_KEY ? 'get_post' : undefined,
      ),
    };
    const agentAuthGuard = {
      canActivate: jest.fn().mockResolvedValue(true),
    };
    const guard = new JwtAuthGuard(reflector as never, agentAuthGuard as never);
    const { context } = createContext('Bearer sk_live_test');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(agentAuthGuard.canActivate).toHaveBeenCalledWith(context);
  });

  it('rejects an Agent session JWT on routes without an Agent API capability', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => (key === IS_PUBLIC_KEY ? true : undefined)),
    };
    const guard = new JwtAuthGuard(
      reflector as never,
      { canActivate: jest.fn() } as never,
    );
    const request = { headers: {}, user: undefined };
    const context = new ExecutionContextHost([request]);
    context.setType('http');
    const agent = {
      userId: '64f000000000000000000002',
      agentId: '64f000000000000000000001',
      username: 'owner',
      role: 'USER',
      authType: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      agentBrowserSessionId: '64f000000000000000000003',
    } as const;

    expect(() => guard.handleRequest(null, agent, null, context)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'AGENT_API_ROUTE_REQUIRED' }),
      }),
    );
  });
});
