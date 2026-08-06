import { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
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
    };
  };

  it('delegates authentication to the shared security pipeline and disables caching', async () => {
    const { service, securityPipelineGuard } = buildService();
    const request = {
      headers: {
        authorization: 'Bearer sk_live_test_key',
        origin: 'http://localhost:8080',
      },
    } as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;

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
    } as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;

    await expect(service.authenticate(request, response)).rejects.toMatchObject({
      code: 'MCP_ORIGIN_FORBIDDEN',
    });
    expect(securityPipelineGuard.canActivate).not.toHaveBeenCalled();
  });
});
