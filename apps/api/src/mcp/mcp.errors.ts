import { HttpException } from '@nestjs/common';

export interface McpErrorDetails {
  retryAfterSeconds?: number;
}

export class McpToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: McpErrorDetails = {},
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readHttpExceptionCode(exception: HttpException): string | null {
  const response = exception.getResponse();
  if (!isRecord(response)) return null;
  return typeof response.code === 'string' ? response.code : null;
}

function readHttpExceptionDetails(exception: HttpException): McpErrorDetails {
  const response = exception.getResponse();
  if (!isRecord(response)) return {};
  const retryAfterSeconds = isRecord(response.details)
    ? response.details.retryAfterSeconds
    : response.retryAfterSeconds;
  return typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {};
}

export function normalizeMcpError(error: unknown): McpToolError {
  if (error instanceof McpToolError) return error;
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const code = readHttpExceptionCode(error) ?? `HTTP_${status}`;
    const message = status >= 500 ? 'The service could not complete the request.' : code;
    return new McpToolError(code, message, readHttpExceptionDetails(error));
  }
  return new McpToolError('MCP_INTERNAL_ERROR', 'The service could not complete the request.');
}

export function serializeMcpError(error: McpToolError): string {
  return JSON.stringify({
    code: error.code,
    message: error.message,
    ...(error.details.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: error.details.retryAfterSeconds }
      : {}),
  });
}
