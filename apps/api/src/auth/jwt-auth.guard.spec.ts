import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AGENT_API_CAPABILITY_KEY } from './decorators/agent-api.decorator';

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
});
