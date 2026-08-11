import { ExecutionContext } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { z } from 'zod';
import { McpHttpService } from './mcp-http.service';

describe('McpHttpService', () => {
  const principal = {
    authType: 'agent' as const,
    agentId: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012',
    username: 'agent',
    dbTokenVersion: 0,
    payloadTokenVersion: 0,
    role: 'USER' as const,
  };

  const buildService = () => {
    const securityPipelineGuard = {
      canActivate: jest.fn(async (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest<{ user?: typeof principal }>();
        request.user = principal;
        return true;
      }),
    };
    const toolsService = { createServer: jest.fn() };
    return {
      service: new McpHttpService(securityPipelineGuard as never, toolsService as never),
      securityPipelineGuard,
      toolsService,
    };
  };

  it('delegates authentication to the shared security pipeline and disables caching', async () => {
    const { service, securityPipelineGuard } = buildService();
    const request = {
      headers: {
        authorization: 'Bearer sk_live_test_key',
        origin: 'http://localhost:8080',
      },
    } as ExpressRequest;
    const response = { setHeader: jest.fn() } as unknown as ExpressResponse;

    await expect(service.authenticate(request, response)).resolves.toBeUndefined();
    expect(securityPipelineGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
  });

  it('rejects a browser Origin outside the configured allowlist before authentication', async () => {
    const { service, securityPipelineGuard } = buildService();
    const request = {
      headers: {
        authorization: 'Bearer sk_live_test_key',
        origin: 'https://evil.example',
      },
    } as ExpressRequest;
    const response = { setHeader: jest.fn() } as unknown as ExpressResponse;

    await expect(service.authenticate(request, response)).rejects.toMatchObject({
      code: 'MCP_ORIGIN_FORBIDDEN',
    });
    expect(securityPipelineGuard.canActivate).not.toHaveBeenCalled();
  });

  it('serves the 2025 stateless HTTP handshake and discovery calls', async () => {
    const { service, toolsService } = buildService();
    toolsService.createServer.mockImplementation(() => {
      const server = new McpServer({ name: 'skynet-test', version: '1.0.0' });
      server.registerTool(
        'test_tool',
        { description: 'A test tool', inputSchema: z.object({}) },
        async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
      );
      server.registerPrompt(
        'test_prompt',
        { description: 'A test prompt', argsSchema: {} },
        async (_args) => ({
          messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
        }),
      );
      return server;
    });

    const headers = {
      Authorization: 'Bearer sk_live_test_key',
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    };
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    const call = async (body: Record<string, unknown>) => {
      const request = Object.assign(Readable.from([]), {
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: headers.Authorization,
          accept: headers.Accept,
          'content-type': headers['Content-Type'],
        },
      }) as IncomingMessage;
      const chunks: string[] = [];
      const response = {
        setHeader: jest.fn(),
        writeHead: jest.fn(),
        write: jest.fn((chunk: string | Uint8Array) => {
          chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
          return true;
        }),
        end: jest.fn(),
        on: jest.fn(),
      } as unknown as ServerResponse;
      await service.authenticate(request as ExpressRequest, response as ExpressResponse);
      await service.getNodeHandler()(request, response, body);
      expect(response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
      expect(chunks.join('')).toContain('jsonrpc');
    };

    await call(initialize);
    await call({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await call({ jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} });
  });
});
