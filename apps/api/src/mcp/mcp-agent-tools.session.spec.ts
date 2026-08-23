import type { ClientSession } from 'mongoose';
import { McpAgentToolsService } from './mcp-agent-tools.service';

const ALLOW_EXECUTION_POLICY = {
  executeTool: <T>(operation: () => Promise<T>) => operation(),
};

describe('McpAgentToolsService write session propagation', () => {
  it('passes the idempotency transaction session to the business operation', async () => {
    const session = { id: 'mcp-session' } as unknown as ClientSession;
    const idempotencyService = {
      execute: jest.fn(
        async (
          _agentId: string,
          _toolName: string,
          _idempotencyKey: string,
          _input: unknown,
          operation: (activeSession: ClientSession) => Promise<unknown>,
        ) => operation(session),
      ),
    };
    const service = new McpAgentToolsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      idempotencyService as never,
      ALLOW_EXECUTION_POLICY as never,
    );
    const operation = jest.fn(async (activeSession: ClientSession) => activeSession);

    const result = await (
      service as unknown as {
        runWrite: (
          principal: { agentId: string },
          toolName: string,
          args: Record<string, unknown> & { idempotencyKey?: string },
          operation: (activeSession: ClientSession) => Promise<ClientSession>,
        ) => Promise<ClientSession>;
      }
    ).runWrite({ agentId: 'agent-1' }, 'forum_write', { idempotencyKey: 'key-1' }, operation);

    expect(result).toBe(session);
    expect(operation).toHaveBeenCalledWith(session);
  });

  it('passes the transaction session to forum create operations', async () => {
    const session = { id: 'forum-session' } as unknown as ClientSession;
    const forumService = {
      createPost: jest.fn().mockResolvedValue({ outcome: 'PUBLISHED' }),
      createReply: jest.fn(),
    };
    const communityWriteAccessService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
    };
    const idempotencyService = {
      execute: jest.fn(
        async (
          _agentId: string,
          _toolName: string,
          _idempotencyKey: string,
          _input: unknown,
          operation: (activeSession: ClientSession) => Promise<unknown>,
        ) => operation(session),
      ),
    };
    const service = new McpAgentToolsService(
      {} as never,
      communityWriteAccessService as never,
      forumService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      idempotencyService as never,
      ALLOW_EXECUTION_POLICY as never,
    );

    const server = service.createServer({
      authType: 'agent',
      agentId: 'agent-1',
      userId: 'user-1',
      username: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: 'USER',
    });
    const { Client, InMemoryTransport } = await import('@modelcontextprotocol/client');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'session-test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: 'forum_write',
      arguments: {
        operation: 'CREATE_POST',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440101',
          title: 'A post',
          content: 'Body',
          tags: ['DISCUSSION'],
          circleId: 'circle-1',
        },
      },
    });

    expect(result.isError).not.toBe(true);
    expect(forumService.createPost).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ circleId: 'circle-1' }),
      session,
    );
    await client.close();
    await server.close();
  });

  it('passes the transaction session to proposal create operations', async () => {
    const session = { id: 'proposal-session' } as unknown as ClientSession;
    const proposalService = {
      create: jest.fn().mockResolvedValue({ id: 'proposal-1' }),
    };
    const communityWriteAccessService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
    };
    const idempotencyService = {
      execute: jest.fn(
        async (
          _agentId: string,
          _toolName: string,
          _idempotencyKey: string,
          _input: unknown,
          operation: (activeSession: ClientSession) => Promise<unknown>,
        ) => operation(session),
      ),
    };
    const service = new McpAgentToolsService(
      {} as never,
      communityWriteAccessService as never,
      {} as never,
      {} as never,
      proposalService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      idempotencyService as never,
      ALLOW_EXECUTION_POLICY as never,
    );
    const server = service.createServer({
      authType: 'agent',
      agentId: 'agent-1',
      userId: 'user-1',
      username: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: 'USER',
    });
    const { Client, InMemoryTransport } = await import('@modelcontextprotocol/client');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'session-test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: 'proposal_write',
      arguments: {
        operation: 'CREATE',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440102',
          circleId: 'circle-1',
          scope: 'TOPIC',
          expectedVersion: 1,
          reason: 'A proposal reason',
          topic: 'A topic',
        },
      },
    });

    expect(result.isError).not.toBe(true);
    expect(proposalService.create).toHaveBeenCalledWith(
      'circle-1',
      'agent-1',
      '550e8400-e29b-41d4-a716-446655440102',
      expect.objectContaining({ scope: 'TOPIC' }),
      session,
    );
    await client.close();
    await server.close();
  });

  it('passes the transaction session to every MCP write domain entry point', async () => {
    const session = { id: 'all-writes-session' } as unknown as ClientSession;
    const idempotencyService = {
      execute: jest.fn(
        async (
          _agentId: string,
          _toolName: string,
          _idempotencyKey: string,
          _input: unknown,
          operation: (activeSession: ClientSession) => Promise<unknown>,
        ) => operation(session),
      ),
    };
    const communityWriteAccessService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
    };
    const forumService = {
      feedbackOnPost: jest.fn().mockResolvedValue({ action: 'created' }),
    };
    const watchService = {
      watch: jest.fn().mockResolvedValue({ watching: true }),
    };
    const circleService = {
      join: jest.fn().mockResolvedValue({ joined: true }),
    };
    const governanceService = {
      dispatchNextCase: jest.fn().mockResolvedValue({ id: 'case-1' }),
    };
    const reportService = {
      createReport: jest.fn().mockResolvedValue({ created: true }),
    };
    const service = new McpAgentToolsService(
      {} as never,
      communityWriteAccessService as never,
      forumService as never,
      circleService as never,
      {} as never,
      governanceService as never,
      {} as never,
      watchService as never,
      reportService as never,
      {} as never,
      {} as never,
      idempotencyService as never,
      ALLOW_EXECUTION_POLICY as never,
    );
    const server = service.createServer({
      authType: 'agent',
      agentId: 'agent-1',
      userId: 'user-1',
      username: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: 'USER',
    });
    const { Client, InMemoryTransport } = await import('@modelcontextprotocol/client');
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'session-test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    await client.callTool({
      name: 'forum_interaction',
      arguments: {
        operation: 'FEEDBACK',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440103',
          targetType: 'POST',
          targetId: 'post-1',
          feedbackType: 'SPARK',
        },
      },
    });
    await client.callTool({
      name: 'forum_interaction',
      arguments: {
        operation: 'WATCH',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440104',
          postId: 'post-1',
          state: 'WATCHING',
        },
      },
    });
    await client.callTool({
      name: 'circle_write',
      arguments: {
        operation: 'SET_MEMBERSHIP',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440105',
          circleId: 'circle-1',
          state: 'JOINED',
        },
      },
    });
    await client.callTool({
      name: 'governance_write',
      arguments: {
        operation: 'GET_OR_CLAIM',
        input: { idempotencyKey: '550e8400-e29b-41d4-a716-446655440106' },
      },
    });
    await client.callTool({
      name: 'report_write',
      arguments: {
        operation: 'CREATE',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440107',
          targetType: 'POST',
          targetId: 'post-1',
          targetContentVersion: 1,
          reason: 'SPAM_OR_FLOODING',
        },
      },
    });

    expect(forumService.feedbackOnPost).toHaveBeenCalledWith(
      'agent-1',
      'post-1',
      { type: 'SPARK' },
      session,
    );
    expect(watchService.watch).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1' }),
      'post-1',
      session,
    );
    expect(circleService.join).toHaveBeenCalledWith('agent-1', 'circle-1', session);
    expect(governanceService.dispatchNextCase).toHaveBeenCalledWith('agent-1', session);
    expect(reportService.createReport).toHaveBeenCalledWith(
      'agent-1',
      'user-1',
      expect.objectContaining({ targetId: 'post-1' }),
      session,
    );

    await client.close();
    await server.close();
  });
});
