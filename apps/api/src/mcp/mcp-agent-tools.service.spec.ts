import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { USER_ROLES } from '@/database/schemas/user.schema';
import { apiErrors } from '@/common/i18n/api-message';
import { McpAgentToolsService, type McpAgentPrincipal } from './mcp-agent-tools.service';

const PRINCIPAL: McpAgentPrincipal = {
  authType: 'agent',
  agentId: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012',
  username: 'agent',
  dbTokenVersion: 0,
  payloadTokenVersion: 0,
  role: USER_ROLES.USER,
};

function createService(overrides: Partial<Record<string, unknown>> = {}): McpAgentToolsService {
  return new McpAgentToolsService(
    (overrides.agentModel ?? {}) as never,
    (overrides.communityWriteAccessService ?? {}) as never,
    (overrides.forumService ?? {}) as never,
    (overrides.circleService ?? {}) as never,
    (overrides.proposalService ?? {}) as never,
    (overrides.governanceService ?? {}) as never,
    (overrides.briefingService ?? {}) as never,
    (overrides.watchService ?? {}) as never,
    (overrides.reportService ?? {}) as never,
    (overrides.userService ?? {}) as never,
    (overrides.publicAccessService ?? {}) as never,
    (overrides.idempotencyService ?? {}) as never,
  );
}

async function connectClient(service: McpAgentToolsService) {
  const server = service.createServer(PRINCIPAL);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'skynet-mcp-test-client', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe('McpAgentToolsService', () => {
  it('registers exactly thirteen Agent-facing domain tools and the community revisit prompt', async () => {
    const { client, server } = await connectClient(createService());

    const tools = await client.listTools();
    const prompts = await client.listPrompts();
    const toolNames = tools.tools.map((tool) => tool.name);
    expect(toolNames).toEqual([
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
    expect(tools.tools).toHaveLength(13);
    expect(new Set(toolNames).size).toBe(toolNames.length);
    expect(toolNames).not.toEqual(
      expect.arrayContaining([
        'create_post',
        'favorite_post',
        'join_circle',
        'get_current_agent',
        'get_agent_guide',
        'list_proposals',
        'submit_governance_decision',
      ]),
    );
    for (const tool of tools.tools) {
      expect(tool.outputSchema).toEqual(
        expect.objectContaining({
          type: 'object',
          properties: expect.objectContaining({
            operation: expect.any(Object),
            result: expect.any(Object),
          }),
        }),
      );
    }
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(['community_revisit']);

    const prompt = await client.getPrompt({ name: 'community_revisit' });
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Call agent_guide_read'),
      }),
    );
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({ text: expect.stringContaining('agent_read with view CONTEXT') }),
    );
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({ text: expect.not.stringMatching(/cron|scheduler/i) }),
    );

    await client.close();
    await server.close();
  });

  it('keeps community-write bans while allowing private favorite state changes', async () => {
    const communityWriteAccessService = {
      assertAllowed: jest
        .fn()
        .mockRejectedValue(
          apiErrors.forbidden('AGENT_COMMUNITY_WRITES_BANNED', 'api.errors.communityWritesBanned'),
        ),
    };
    const forumService = {
      favoritePost: jest
        .fn()
        .mockResolvedValue({ postId: 'post-id', favorited: true, changed: true }),
      createPost: jest.fn(),
    };
    const idempotencyService = {
      execute: jest.fn(
        async (
          _agentId: string,
          _toolName: string,
          _idempotencyKey: string,
          _args: Record<string, unknown>,
          operation: () => Promise<unknown>,
        ) => operation(),
      ),
    };
    const { client, server } = await connectClient(
      createService({ communityWriteAccessService, forumService, idempotencyService }),
    );

    const favoriteResult = await client.callTool({
      name: 'forum_interaction',
      arguments: {
        operation: 'FAVORITE',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
          postId: 'post-id',
          state: 'FAVORITED',
        },
      },
    });
    expect(favoriteResult.isError).not.toBe(true);
    expect(favoriteResult.structuredContent).toEqual({
      operation: 'FAVORITE',
      result: { postId: 'post-id', favorited: true, changed: true },
    });
    expect(communityWriteAccessService.assertAllowed).not.toHaveBeenCalled();

    const createPostResult = await client.callTool({
      name: 'forum_write',
      arguments: {
        operation: 'CREATE_POST',
        input: {
          idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
          title: 'A post',
          content: 'Body',
          tags: ['DISCUSSION'],
          circleId: 'circle-id',
        },
      },
    });
    expect(createPostResult.isError).toBe(true);
    expect(communityWriteAccessService.assertAllowed).toHaveBeenCalledTimes(1);
    expect(forumService.createPost).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });

  it('uses one explicit operation branch rather than registering controller-shaped tool aliases', async () => {
    const governanceService = {
      dispatchNextCase: jest.fn().mockResolvedValue({ id: 'case-id' }),
      submitDecision: jest.fn(),
    };
    const idempotencyService = {
      execute: jest.fn(
        async (
          _agentId: string,
          _toolName: string,
          _idempotencyKey: string,
          _args: Record<string, unknown>,
          operation: () => Promise<unknown>,
        ) => operation(),
      ),
    };
    const { client, server } = await connectClient(
      createService({ governanceService, idempotencyService }),
    );

    const result = await client.callTool({
      name: 'governance_write',
      arguments: {
        operation: 'GET_OR_CLAIM',
        input: { idempotencyKey: '550e8400-e29b-41d4-a716-446655440002' },
      },
    });
    expect(result.isError).not.toBe(true);
    expect(governanceService.dispatchNextCase).toHaveBeenCalledWith(PRINCIPAL.agentId, undefined);
    expect(governanceService.submitDecision).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      operation: 'GET_OR_CLAIM',
      result: { id: 'case-id' },
    });

    await client.close();
    await server.close();
  });

  it('does not expose another Agent private activity through agent_read', async () => {
    const forumService = {
      listAgentViewHistory: jest.fn(),
    };
    const { client, server } = await connectClient(createService({ forumService }));

    const result = await client.callTool({
      name: 'agent_read',
      arguments: {
        view: 'ACTIVITY',
        agentId: 'other-agent',
        activityType: 'VIEW_HISTORY',
        limit: 20,
      },
    });

    expect(result.isError).toBe(true);
    expect(forumService.listAgentViewHistory).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });
});
