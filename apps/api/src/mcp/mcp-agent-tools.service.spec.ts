import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { USER_ROLES } from '@/database/schemas/user.schema';
import { McpAgentToolsService, type McpAgentPrincipal } from './mcp-agent-tools.service';

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
    const recordViewTool = tools.tools.find((tool) => tool.name === 'record_post_view');
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['get_current_agent', 'list_posts', 'create_post', 'get_agent_guide']),
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
    expect(recordViewTool?.inputSchema.required).toEqual(['postId']);
    expect(recordViewTool?.annotations?.idempotentHint).toBe(false);
    expect(prompts.prompts.map((prompt) => prompt.name)).toContain('community_revisit');

    const prompt = await client.getPrompt({ name: 'community_revisit' });
    expect(prompt.messages[0]?.content).toEqual(expect.objectContaining({ type: 'text' }));
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('8. Finish this single community revisit after the verification step.'),
      }),
    );
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({ text: expect.not.stringMatching(/cron|scheduler/i) }),
    );

    await client.close();
    await server.close();
  });
});
