import { Logger } from '@nestjs/common';
import { USER_ROLES } from '@/database/schemas/user.schema';
import { McpToolError } from './mcp.errors';
import {
  MCP_TOOL_POLICIES,
  McpExecutionPolicyService,
  McpSubscriptionLease,
  McpToolInvocationPermit,
  classifyMcpRequest,
} from './mcp-execution-policy.service';

const PRINCIPAL = {
  authType: 'agent' as const,
  agentId: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012',
  username: 'agent',
  dbTokenVersion: 0,
  payloadTokenVersion: 0,
  role: USER_ROLES.USER,
};

describe('MCP execution policy', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('assigns one point to protocol and guide requests, two to reads, and four to writes', () => {
    expect(classifyMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' })).toEqual({
      cost: 1,
      toolName: null,
      subscription: false,
    });
    expect(
      classifyMcpRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'agent_guide_read', arguments: {} },
      }),
    ).toEqual({ cost: 1, toolName: 'agent_guide_read', subscription: false });
    expect(
      classifyMcpRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'forum_read', arguments: {} },
      }),
    ).toEqual({ cost: 2, toolName: 'forum_read', subscription: false });
    expect(
      classifyMcpRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'forum_write', arguments: {} },
      }),
    ).toEqual({ cost: 4, toolName: 'forum_write', subscription: false });
    expect(
      classifyMcpRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'unknown_tool', arguments: {} },
      }),
    ).toEqual({ cost: 4, toolName: null, subscription: false });
    expect(
      classifyMcpRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'subscriptions/listen',
        params: {},
      }),
    ).toEqual({ cost: 1, toolName: null, subscription: true });

    expect(Object.keys(MCP_TOOL_POLICIES)).toEqual([
      'agent_read',
      'agent_update',
      'forum_read',
      'forum_write',
      'forum_interaction',
      'circle_read',
      'circle_write',
      'proposal_read',
      'proposal_write',
      'governance_read',
      'governance_write',
      'report_write',
      'agent_guide_read',
    ]);
  });

  it('returns stable retry details when the Redis admission script rejects rate or concurrency', async () => {
    const evalCommand = jest
      .fn()
      .mockResolvedValueOnce(['RATE_LIMITED', 1_501])
      .mockResolvedValueOnce(['CONCURRENCY_LIMITED', 2_001]);
    const service = new McpExecutionPolicyService({
      getClient: () => ({ eval: evalCommand }),
    } as never);
    const toolCall = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'forum_read', arguments: {} },
    };

    await expect(service.admitRequest(PRINCIPAL, toolCall)).rejects.toMatchObject({
      code: 'MCP_RATE_LIMITED',
      details: { retryAfterSeconds: 2 },
    });
    await expect(service.admitRequest(PRINCIPAL, toolCall)).rejects.toMatchObject({
      code: 'MCP_CONCURRENCY_LIMITED',
      details: { retryAfterSeconds: 3 },
    });
  });

  it('makes one admitted permit available only inside its asynchronous MCP request scope', async () => {
    const service = new McpExecutionPolicyService({
      getClient: () => ({ eval: jest.fn() }),
    } as never);
    const release = jest.fn().mockResolvedValue(undefined);
    const permit = new McpToolInvocationPermit({
      deadlineMs: 30_000,
      heartbeatMs: 10_000,
      renew: jest.fn().mockResolvedValue(undefined),
      release,
    });

    await expect(
      service.runWithToolPermit(permit, new AbortController().signal, () =>
        service.executeTool(async () => 'ok'),
      ),
    ).resolves.toBe('ok');
    await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1);

    expect(() => service.executeTool(async () => 'outside')).toThrow(
      expect.objectContaining({ code: 'MCP_POLICY_UNAVAILABLE' }),
    );
  });

  it('keeps renewing an admitted Tool lease after the 30 second response deadline until the real operation settles', async () => {
    jest.useFakeTimers();
    const renew = jest.fn().mockResolvedValue(undefined);
    const release = jest.fn().mockResolvedValue(undefined);
    const permit = new McpToolInvocationPermit({
      deadlineMs: 30_000,
      heartbeatMs: 10_000,
      renew,
      release,
    });
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = new Promise<string>((resolve) => {
      resolveOperation = resolve;
    });

    const result = permit.execute(new AbortController().signal, () => operation);
    const timeoutExpectation = expect(result).rejects.toMatchObject({
      code: 'MCP_TOOL_TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(30_000);

    await timeoutExpectation;
    const renewalsAtTimeout = renew.mock.calls.length;
    expect(renewalsAtTimeout).toBeGreaterThanOrEqual(2);
    expect(release).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(10_000);
    expect(renew.mock.calls.length).toBeGreaterThan(renewalsAtTimeout);
    expect(release).not.toHaveBeenCalled();

    resolveOperation?.('finished');
    await Promise.resolve();
    await Promise.resolve();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails the Tool response and blocks this service instance until work settles after lease renewal fails', async () => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    let confirmRelease: (() => void) | undefined;
    const releaseObserved = new Promise<void>((resolve) => {
      confirmRelease = resolve;
    });
    const evalCommand = jest
      .fn()
      .mockResolvedValueOnce(['ALLOWED', 0])
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockImplementationOnce(() => {
        confirmRelease?.();
        return Promise.resolve(1);
      })
      .mockResolvedValueOnce(['ALLOWED', 0]);
    const ping = jest.fn().mockResolvedValue('PONG');
    const service = new McpExecutionPolicyService({
      getClient: () => ({ eval: evalCommand, ping }),
    } as never);
    const toolCall = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'forum_read', arguments: {} },
    };
    const admission = await service.admitRequest(PRINCIPAL, toolCall);
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = new Promise<string>((resolve) => {
      resolveOperation = resolve;
    });
    let executionError: unknown;
    void service
      .runWithToolPermit(
        admission.toolPermit,
        new AbortController().signal,
        () => service.executeTool(() => operation),
      )
      .catch((error: unknown) => {
        executionError = error;
      });

    await jest.advanceTimersByTimeAsync(15_000);
    await Promise.resolve();

    expect(executionError).toMatchObject({ code: 'MCP_POLICY_UNAVAILABLE' });
    await expect(
      service.admitRequest(PRINCIPAL, { jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    ).rejects.toMatchObject({ code: 'MCP_POLICY_UNAVAILABLE' });
    expect(evalCommand).toHaveBeenCalledTimes(2);

    resolveOperation?.('finished');
    await releaseObserved;
    await jest.advanceTimersByTimeAsync(0);

    await expect(
      service.admitRequest(PRINCIPAL, { jsonrpc: '2.0', id: 3, method: 'tools/list' }),
    ).resolves.toEqual({ toolPermit: null, subscriptionLease: null });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledTimes(4);
  });

  it('releases an unused permit once and rejects a later claim', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const permit = new McpToolInvocationPermit({
      deadlineMs: 30_000,
      heartbeatMs: 10_000,
      renew: jest.fn().mockResolvedValue(undefined),
      release,
    });

    await permit.releaseIfUnused();
    await permit.releaseIfUnused();
    expect(release).toHaveBeenCalledTimes(1);

    await expect(
      permit.execute(new AbortController().signal, async () => 'too-late'),
    ).rejects.toBeInstanceOf(McpToolError);
  });

  it('signals the HTTP stream when a subscription lease loses Redis ownership', async () => {
    jest.useFakeTimers();
    const onLost = jest.fn();
    const lease = new McpSubscriptionLease({
      heartbeatMs: 10_000,
      renew: jest.fn().mockResolvedValue(false),
      release: jest.fn().mockResolvedValue(undefined),
    });
    lease.onLost(onLost);

    await jest.advanceTimersByTimeAsync(10_000);

    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('signals the HTTP stream when subscription renewal cannot reach Redis', async () => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const onLost = jest.fn();
    const lease = new McpSubscriptionLease({
      heartbeatMs: 10_000,
      renew: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      release: jest.fn().mockResolvedValue(undefined),
    });
    lease.onLost(onLost);

    await jest.advanceTimersByTimeAsync(10_000);

    expect(onLost).toHaveBeenCalledTimes(1);
  });
});
