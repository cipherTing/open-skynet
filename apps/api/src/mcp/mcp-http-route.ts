import { HttpException } from '@nestjs/common';
import {
  json,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import {
  McpExecutionPolicyService,
  type McpRequestAdmission,
} from './mcp-execution-policy.service';
import { McpHttpService } from './mcp-http.service';
import { McpToolError, normalizeMcpError } from './mcp.errors';

const MCP_HTTP_PATH = '/api/v1/mcp';
const MCP_REQUEST_BODY_LIMIT = '256kb';

function parseMcpJsonBody(
  parser: RequestHandler,
  request: Request,
  response: Response,
): Promise<void> {
  return new Promise((resolve, reject) => {
    parser(request, response, (error?: unknown) => {
      if (error !== undefined) {
        reject(normalizeParserError(error));
        return;
      }
      resolve();
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeParserError(error: unknown): McpToolError {
  if (isRecord(error)) {
    if (error.status === 413 || error.statusCode === 413 || error.type === 'entity.too.large') {
      return new McpToolError(
        'MCP_BODY_TOO_LARGE',
        'The MCP request body exceeds the 256kb limit.',
      );
    }
    if (error.status === 400 || error.statusCode === 400 || error.type === 'entity.parse.failed') {
      return new McpToolError('MCP_INVALID_JSON', 'The MCP request body must be valid JSON.');
    }
  }
  return new McpToolError('MCP_INVALID_JSON', 'The MCP request body must be valid JSON.');
}

function getHttpStatus(error: unknown, code: string): number {
  if (error instanceof HttpException) return error.getStatus();
  if (code === 'UNAUTHORIZED') return 401;
  if (code === 'MCP_ORIGIN_FORBIDDEN') return 403;
  if (code === 'MCP_BATCH_NOT_SUPPORTED' || code === 'MCP_INVALID_JSON') return 400;
  if (code === 'MCP_BODY_TOO_LARGE') return 413;
  if (
    code === 'RATE_LIMITED' ||
    code === 'MCP_RATE_LIMITED' ||
    code === 'MCP_CONCURRENCY_LIMITED' ||
    code === 'MCP_SUBSCRIPTION_LIMITED'
  ) {
    return 429;
  }
  if (code === 'MCP_POLICY_UNAVAILABLE') return 503;
  return 500;
}

function writeMcpHttpError(error: unknown, response: Response): void {
  if (response.headersSent) return;
  const normalized = normalizeMcpError(error);
  const status = getHttpStatus(error, normalized.code);
  if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
  if (normalized.details.retryAfterSeconds !== undefined) {
    response.setHeader('Retry-After', String(normalized.details.retryAfterSeconds));
  }
  response.status(status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  });
}

async function releaseAdmission(admission: McpRequestAdmission | null): Promise<void> {
  await admission?.toolPermit?.releaseIfUnused();
  await admission?.subscriptionLease?.release();
}

export function registerMcpHttpRoute(
  expressApp: Express,
  mcpHttpService: McpHttpService,
  executionPolicyService: McpExecutionPolicyService,
): void {
  const parser = json({
    limit: MCP_REQUEST_BODY_LIMIT,
    type: (request) => request.method !== 'GET' && request.method !== 'HEAD',
  });
  const nodeHandler = mcpHttpService.getNodeHandler();

  expressApp.all(MCP_HTTP_PATH, (request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'OPTIONS') {
      next();
      return;
    }

    void (async () => {
      let admission: McpRequestAdmission | null = null;
      const requestAbort = new AbortController();
      const abortRequest = () => requestAbort.abort();
      response.once('close', abortRequest);
      if (response.destroyed) abortRequest();
      try {
        const principal = await mcpHttpService.authenticate(request, response);
        await parseMcpJsonBody(parser, request, response);
        if (Array.isArray(request.body)) {
          throw new McpToolError(
            'MCP_BATCH_NOT_SUPPORTED',
            'JSON-RPC batch requests are not supported.',
          );
        }

        admission = await executionPolicyService.admitRequest(principal, request.body);
        admission.subscriptionLease?.onLost(() => {
          if (!response.destroyed) response.destroy();
        });
        await executionPolicyService.runWithToolPermit(
          admission.toolPermit,
          requestAbort.signal,
          () => nodeHandler(request, response, request.body),
        );
      } catch (error) {
        writeMcpHttpError(error, response);
      } finally {
        response.off('close', abortRequest);
        await releaseAdmission(admission);
      }
    })();
  });
}
