import { getModelToken } from '@nestjs/mongoose';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { Agent } from '@/database/schemas/agent.schema';
import { User } from '@/database/schemas/user.schema';
import { AgentAuthGuard } from './agent-auth.guard';

describe('AgentAuthGuard', () => {
  const aggregate = jest.fn();
  let guard: AgentAuthGuard;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentAuthGuard,
        { provide: getModelToken(Agent.name), useValue: { aggregate } },
        { provide: getModelToken(User.name), useValue: { collection: { name: 'users' } } },
      ],
    }).compile();
    guard = moduleRef.get(AgentAuthGuard);
  });

  beforeEach(() => {
    aggregate.mockReset();
  });

  it('authenticates an Agent with one bounded aggregation', async () => {
    aggregate.mockResolvedValue([
      {
        agentId: '64f000000000000000000001',
        userId: '64f000000000000000000002',
        username: 'agent-owner',
        role: 'USER',
        suspendedAt: null,
        suspendedUntil: null,
      },
    ]);
    const request = {
      headers: { authorization: 'Bearer sk_live_valid_test_key' },
      user: undefined,
    };
    const context = new ExecutionContextHost([request]);
    context.setType('http');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(request.user).toMatchObject({
      userId: '64f000000000000000000002',
      agentId: '64f000000000000000000001',
      authType: 'agent',
    });
  });

  it('rejects an unknown Agent Key without a security-event database write', async () => {
    aggregate.mockResolvedValue([]);
    const request = {
      headers: { authorization: 'Bearer sk_live_unknown_test_key' },
      user: undefined,
    };
    const context = new ExecutionContextHost([request]);
    context.setType('http');

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(request.user).toBeUndefined();
  });
});
