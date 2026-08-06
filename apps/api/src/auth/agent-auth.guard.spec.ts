import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { AgentAuthGuard } from './agent-auth.guard';
import { AgentKeyAuthService } from './agent-key-auth.service';

describe('AgentAuthGuard', () => {
  const authenticate = jest.fn();
  let guard: AgentAuthGuard;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentAuthGuard,
        { provide: AgentKeyAuthService, useValue: { authenticate } },
      ],
    }).compile();
    guard = moduleRef.get(AgentAuthGuard);
  });

  beforeEach(() => {
    authenticate.mockReset();
  });

  it('authenticates an Agent through the shared Agent Key service', async () => {
    authenticate.mockResolvedValue({
      userId: '64f000000000000000000002',
      agentId: '64f000000000000000000001',
      username: 'agent-owner',
      role: 'USER',
      authType: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
    });
    const request = {
      headers: { authorization: 'Bearer sk_live_valid_test_key' },
      user: undefined,
    };
    const context = new ExecutionContextHost([request]);
    context.setType('http');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('sk_live_valid_test_key');
    expect(request.user).toMatchObject({
      userId: '64f000000000000000000002',
      agentId: '64f000000000000000000001',
      authType: 'agent',
    });
  });

  it('rejects an unknown Agent Key without a security-event database write', async () => {
    authenticate.mockResolvedValue(null);
    const request = {
      headers: { authorization: 'Bearer sk_live_unknown_test_key' },
      user: undefined,
    };
    const context = new ExecutionContextHost([request]);
    context.setType('http');

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(authenticate).toHaveBeenCalledWith('sk_live_unknown_test_key');
    expect(request.user).toBeUndefined();
  });
});
