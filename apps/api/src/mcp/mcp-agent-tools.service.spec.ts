import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { USER_ROLES } from '@/database/schemas/user.schema';
import { McpAgentToolsService, type McpAgentPrincipal } from './mcp-agent-tools.service';
import { AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';
import { apiErrors } from '@/common/i18n/api-message';

describe('McpAgentToolsService', () => {
  it('registers the Agent-facing tools and community revisit prompt on a fresh server', async () => {
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
      {} as never,
      {} as never,
    );
    const principal: McpAgentPrincipal = {
      authType: 'agent',
      agentId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439012',
      username: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: USER_ROLES.USER,
    };
    const server = service.createServer(principal);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'skynet-mcp-test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const prompts = await client.listPrompts();
    const favoriteTool = tools.tools.find((tool) => tool.name === 'favorite_post');
    const joinTool = tools.tools.find((tool) => tool.name === 'join_circle');
    const profileTool = tools.tools.find((tool) => tool.name === 'update_my_agent_profile');
    const toolNames = tools.tools.map((tool) => tool.name);
    expect(tools.tools).toHaveLength(54);
    const registeredCapabilities = new Set<string>(Object.values(AGENT_API_CAPABILITIES));
    expect(toolNames.every((name) => registeredCapabilities.has(name))).toBe(true);
    expect(new Set(toolNames).size).toBe(toolNames.length);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'get_current_agent',
        'list_posts',
        'create_post',
        'get_agent_guide',
        'list_my_posts',
        'list_agent_posts',
        'get_or_claim_governance_case',
      ]),
    );
    expect(toolNames).not.toEqual(
      expect.arrayContaining([
        'record_post_view',
        'list_post_revisions',
        'list_reply_revisions',
        'list_proposal_revisions',
        'list_proposal_voters',
        'withdraw_proposal_stance',
        'get_current_governance_case',
        'get_governance_stats',
        'find_similar_posts',
        'revise_post',
        'revise_reply',
      ]),
    );
    for (const tool of tools.tools) {
      const properties = tool.inputSchema.properties ?? {};
      for (const fieldSchema of Object.values(properties)) {
        expect(fieldSchema).toEqual(
          expect.objectContaining({
            description: expect.any(String),
          }),
        );
      }
    }
    expect(favoriteTool?.inputSchema.required).toEqual(
      expect.arrayContaining(['idempotencyKey', 'postId']),
    );
    expect(joinTool?.inputSchema.required).toEqual(
      expect.arrayContaining(['idempotencyKey', 'circleId']),
    );
    expect(profileTool?.inputSchema.properties).toEqual(
      expect.not.objectContaining({
        favoritesPublic: expect.anything(),
        ownerOperationEnabled: expect.anything(),
      }),
    );
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain('community_revisit');

    const prompt = await client.getPrompt({ name: 'community_revisit' });
    expect(prompt.messages[0]?.content).toEqual(expect.objectContaining({ type: 'text' }));
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          '8. Finish this single community revisit after the verification step.',
        ),
      }),
    );
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({ text: expect.not.stringMatching(/cron|scheduler/i) }),
    );

    await client.close();
    await server.close();
  });

  it('keeps community-write bans aligned with REST write boundaries', async () => {
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
      {} as never,
      idempotencyService as never,
    );
    const principal: McpAgentPrincipal = {
      authType: 'agent',
      agentId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439012',
      username: 'agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: USER_ROLES.USER,
    };
    const server = service.createServer(principal);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'skynet-mcp-write-boundary-test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const favoriteResult = await client.callTool({
      name: 'favorite_post',
      arguments: {
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        postId: 'post-id',
      },
    });
    expect(favoriteResult.isError).not.toBe(true);
    expect(communityWriteAccessService.assertAllowed).not.toHaveBeenCalled();

    const createPostResult = await client.callTool({
      name: 'create_post',
      arguments: {
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
        title: 'A post',
        content: 'Body',
        tags: ['DISCUSSION'],
        circleId: 'circle-id',
      },
    });
    expect(createPostResult.isError).toBe(true);
    expect(communityWriteAccessService.assertAllowed).toHaveBeenCalledTimes(1);

    await client.close();
    await server.close();
  });
});
