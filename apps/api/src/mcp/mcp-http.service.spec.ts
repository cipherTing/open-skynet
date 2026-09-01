import { ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { McpServer } from '@modelcontextprotocol/server';
import { Readable } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { z } from 'zod';
import { McpHttpService } from './mcp-http.service';
import { PRE_AUTH_THROTTLE_KEY } from '@/common/guards/pre-auth-throttle.decorator';

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
      canActivateBeforeAuthentication: jest.fn().mockResolvedValue(true),
      canActivateAfterPreAuthentication: jest.fn(async (context: ExecutionContext) => {
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

  afterEach(() => jest.restoreAllMocks());

  it('delegates authentication to the shared security pipeline and disables caching', async () => {
    const { service, securityPipelineGuard } = buildService();
    const request = {
      headers: {
        authorization: 'Bearer sk_live_test_key',
        origin: 'http://localhost:8080',
      },
    } as ExpressRequest;
    const response = { setHeader: jest.fn() } as unknown as ExpressResponse;

    await expect(service.authenticate(request, response)).resolves.toEqual(principal);
    expect(securityPipelineGuard.canActivateBeforeAuthentication).toHaveBeenCalledTimes(1);
    expect(securityPipelineGuard.canActivateAfterPreAuthentication).toHaveBeenCalledTimes(1);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
  });

  it('accepts the browser Origin canonicalized from a configured default HTTP port', async () => {
    const previousCorsOrigin = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN = 'http://localhost:80';
    const { service } = buildService();
    const request = {
      headers: {
        authorization: 'Bearer sk_live_test_key',
        origin: 'http://localhost',
      },
    } as ExpressRequest;
    const response = { setHeader: jest.fn() } as unknown as ExpressResponse;

    try {
      await expect(service.authenticate(request, response)).resolves.toEqual(principal);
    } finally {
      if (previousCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = previousCorsOrigin;
    }
  });

  it('marks the synthetic MCP route for unconditional pre-auth throttling', async () => {
    const reflector = new Reflector();
    const securityPipelineGuard = {
      canActivateBeforeAuthentication: jest.fn(async (context: ExecutionContext) => {
        expect(
          reflector.getAllAndOverride<boolean>(PRE_AUTH_THROTTLE_KEY, [
            context.getHandler(),
            context.getClass(),
          ]),
        ).toBe(true);
        return true;
      }),
      canActivateAfterPreAuthentication: jest.fn(async (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest<{ user?: typeof principal }>();
        request.user = principal;
        return true;
      }),
    };
    const service = new McpHttpService(
      securityPipelineGuard as never,
      {
        createServer: jest.fn(),
      } as never,
    );
    const request = {
      headers: { authorization: 'Bearer malformed-token' },
    } as ExpressRequest;
    const response = { setHeader: jest.fn() } as unknown as ExpressResponse;

    await expect(service.authenticate(request, response)).resolves.toEqual(principal);
    expect(securityPipelineGuard.canActivateBeforeAuthentication).toHaveBeenCalledTimes(1);
  });

  it('charges the pre-auth bucket before rejecting a browser Origin outside the allowlist', async () => {
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
    expect(securityPipelineGuard.canActivateBeforeAuthentication).toHaveBeenCalledTimes(1);
    expect(securityPipelineGuard.canActivateAfterPreAuthentication).not.toHaveBeenCalled();
  });

  it('rejects legacy 2025 transport requests', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
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
      expect(response.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
      expect(chunks.join('')).toContain('Unsupported protocol version');
    };

    await call(initialize);
    expect(toolsService.createServer).not.toHaveBeenCalled();
  });

  it('serves modern discovery, tool listing, and prompt listing requests', async () => {
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
        async () => ({
          messages: [{ role: 'user', content: { type: 'text', text: 'ok' } }],
        }),
      );
      return server;
    });

    const modernMeta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {},
    };
    const call = async (method: 'server/discover' | 'tools/list' | 'prompts/list', id: number) => {
      const request = new IncomingMessage(new Socket());
      request.method = 'POST';
      request.url = '/mcp';
      request.headers = {
        authorization: 'Bearer sk_live_test_key',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-method': method,
        'mcp-protocol-version': '2026-07-28',
      };
      const chunks: string[] = [];
      let statusCode: number | undefined;
      const response = {
        destroyed: false,
        setHeader: jest.fn(),
        writeHead: jest.fn((status: number) => {
          statusCode = status;
        }),
        write: jest.fn((chunk: string | Uint8Array) => {
          chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
          return true;
        }),
        end: jest.fn(),
        on: jest.fn(),
      } as unknown as ServerResponse;

      await service.authenticate(request as ExpressRequest, response as ExpressResponse);
      await service.getNodeHandler()(request, response, {
        jsonrpc: '2.0',
        id,
        method,
        params: { _meta: modernMeta },
      });

      return { statusCode, body: chunks.join('') };
    };

    const discover = await call('server/discover', 1);
    expect(discover.statusCode).toBe(200);
    expect(discover.body).toContain('"supportedVersions":["2026-07-28"]');

    const tools = await call('tools/list', 2);
    expect(tools.statusCode).toBe(200);
    expect(tools.body).toContain('"name":"test_tool"');

    const prompts = await call('prompts/list', 3);
    expect(prompts.statusCode).toBe(200);
    expect(prompts.body).toContain('"name":"test_prompt"');
  });

  it('keeps request-scoped notifications on the temporary auto-SSE path', async () => {
    const { service, toolsService } = buildService();
    toolsService.createServer.mockImplementation(() => {
      const server = new McpServer({ name: 'skynet-test', version: '1.0.0' });
      server.registerTool(
        'test_tool',
        { description: 'A test tool', inputSchema: z.object({}) },
        async (_args, context) => {
          await context.mcpReq.notify({
            method: 'notifications/progress',
            params: { progressToken: 'progress-1', progress: 1, total: 1 },
          });
          return { content: [{ type: 'text' as const, text: 'ok' }] };
        },
      );
      return server;
    });
    const request = new IncomingMessage(new Socket());
    request.method = 'POST';
    request.url = '/mcp';
    request.headers = {
      authorization: 'Bearer sk_live_test_key',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': 'tools/call',
      'mcp-name': 'test_tool',
      'mcp-protocol-version': '2026-07-28',
    };
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
    await service.getNodeHandler()(request, response, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'test_tool',
        arguments: {},
        _meta: {
          progressToken: 'progress-1',
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    });

    expect(response.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(chunks.join('')).toContain('notifications/progress');
    expect(chunks.join('')).toContain('"text":"ok"');
  });

  it('accepts a persistent modern subscription under the configured SDK capacity', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, toolsService } = buildService();
    toolsService.createServer.mockImplementation(
      () => new McpServer({ name: 'skynet-test', version: '1.0.0' }),
    );

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'subscriptions/listen',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
        notifications: { toolsListChanged: true },
      },
    };
    const request = new IncomingMessage(new Socket());
    request.method = 'POST';
    request.url = '/mcp';
    request.headers = {
      authorization: 'Bearer sk_live_test_key',
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': 'subscriptions/listen',
      'mcp-protocol-version': '2026-07-28',
    };
    const chunks: string[] = [];
    let closeScheduled = false;
    const response = new ServerResponse(request);
    jest.spyOn(response, 'write').mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      if (!closeScheduled) {
        closeScheduled = true;
        queueMicrotask(() => response.emit('close'));
      }
      return true;
    });

    await service.authenticate(request as ExpressRequest, response as ExpressResponse);
    await service.getNodeHandler()(request, response, body);

    expect(response.statusCode).toBe(200);
    expect(response.getHeader('content-type')).toEqual(
      expect.stringContaining('text/event-stream'),
    );
    expect(chunks.join('')).not.toContain('Subscription limit reached');
  });
});
