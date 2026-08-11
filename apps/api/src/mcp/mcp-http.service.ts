import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import { toNodeHandler, type NodeMcpRequestHandler } from '@modelcontextprotocol/node';
import type { Request, Response } from 'express';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { USER_ROLES } from '@/database/schemas/user.schema';
import { SecurityPipelineGuard } from '@/common/guards/security-pipeline.guard';
import { getCorsOrigins } from '@/config/env';
import { McpAgentToolsService, type McpAgentPrincipal } from './mcp-agent-tools.service';
import { McpToolError } from './mcp.errors';
import { McpRoute } from '@/auth/decorators/agent-api.decorator';

type McpRequestWithAuth = Request & {
  user?: JwtAuthUser;
  auth?: AuthInfo;
};

class McpRouteBoundary {}
@McpRoute()
class McpRouteHandler {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPrincipal(value: unknown): McpAgentPrincipal {
  if (!isRecord(value)) throw new McpToolError('UNAUTHORIZED', 'A valid Agent Key is required.');
  if (
    value.authType !== 'agent' ||
    typeof value.agentId !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.username !== 'string' ||
    typeof value.dbTokenVersion !== 'number' ||
    typeof value.payloadTokenVersion !== 'number' ||
    (value.role !== USER_ROLES.USER && value.role !== USER_ROLES.ADMIN)
  ) {
    throw new McpToolError('UNAUTHORIZED', 'A valid Agent Key is required.');
  }
  return {
    authType: 'agent',
    agentId: value.agentId,
    userId: value.userId,
    username: value.username,
    dbTokenVersion: value.dbTokenVersion,
    payloadTokenVersion: value.payloadTokenVersion,
    role: value.role,
  };
}

@Injectable()
export class McpHttpService {
  private readonly logger = new Logger(McpHttpService.name);
  private readonly handler: ReturnType<typeof createMcpHandler>;
  private readonly nodeHandler: NodeMcpRequestHandler;

  constructor(
    private readonly securityPipelineGuard: SecurityPipelineGuard,
    private readonly toolsService: McpAgentToolsService,
  ) {
    this.handler = createMcpHandler(
      ({ authInfo }) => {
        const principal = readPrincipal(authInfo?.extra?.principal);
        return this.toolsService.createServer(principal);
      },
      {
        // 兼容仍使用 2025-era Streamable HTTP 的客户端（包括当前常见的
        // Claude/Codex 集成），同时保留 2026-era 请求的现代处理路径。
        // SDK 的 stateless legacy leg 不创建会话，因此不会引入服务端会话状态。
        legacy: 'stateless',
        // 使用 SDK 默认的 auto：普通请求返回 JSON，有通知时自动升级 SSE。
        // 强制 json 会丢弃中途通知，且不符合通用 Streamable HTTP 客户端的默认协商。
        responseMode: 'auto',
        onerror: (error) => this.logger.error(error.message, error.stack),
      },
    );
    this.nodeHandler = toNodeHandler(this.handler, {
      onerror: (error) => this.logger.error(error.message, error.stack),
    });
  }

  getNodeHandler(): NodeMcpRequestHandler {
    return this.nodeHandler;
  }

  async authenticate(request: Request, response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    this.assertOrigin(request);
    const requestWithAuth = request as McpRequestWithAuth;
    const context = new ExecutionContextHost(
      [requestWithAuth, response, () => undefined],
      McpRouteBoundary,
      McpRouteHandler,
    );
    context.setType('http');
    await this.securityPipelineGuard.canActivate(context);

    const user = requestWithAuth.user;
    if (!user || user.authType !== 'agent') {
      throw new McpToolError('UNAUTHORIZED', 'A valid Agent Key is required.');
    }

    const token = this.readBearerToken(request);
    requestWithAuth.auth = {
      token,
      clientId: user.agentId,
      scopes: ['agent'],
      extra: {
        principal: {
          authType: 'agent',
          agentId: user.agentId,
          userId: user.userId,
          username: user.username,
          dbTokenVersion: user.dbTokenVersion,
          payloadTokenVersion: user.payloadTokenVersion,
          role: user.role,
        },
      },
    };
  }

  private readBearerToken(request: Request): string {
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') return '';
    return authorization.replace(/^Bearer\s+/i, '').trim();
  }

  private assertOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || origin.length === 0) return;
    if (!getCorsOrigins().includes(origin)) {
      throw new McpToolError('MCP_ORIGIN_FORBIDDEN', 'The request Origin is not allowed.');
    }
  }
}
