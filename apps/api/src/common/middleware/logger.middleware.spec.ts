import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { LoggerMiddleware } from './logger.middleware';
import { RequestContextService } from '@/common/request-context/request-context.service';

function createResponse() {
  const emitter = new EventEmitter();
  const headers = new Map<string, string>();
  const response = Object.assign(emitter, {
    statusCode: 200,
    setHeader: jest.fn((name: string, value: string) => headers.set(name.toLowerCase(), value)),
    get: jest.fn((name: string) => headers.get(name.toLowerCase())),
  }) as unknown as Response;
  return { response, emitter, headers };
}

describe('LoggerMiddleware request context', () => {
  it('generates a server request id and ignores a client supplied value', () => {
    const requestContext = new RequestContextService();
    const middleware = new LoggerMiddleware(requestContext);
    const request = {
      method: 'GET',
      path: '/health/live',
      originalUrl: '/health/live',
      ip: '127.0.0.1',
      headers: { 'x-request-id': 'attacker-controlled' },
      get: jest.fn(() => undefined),
    } as unknown as Request;
    const { response, headers } = createResponse();
    let activeRequestId: string | undefined;

    middleware.use(request, response, (() => {
      activeRequestId = requestContext.getRequestId();
    }) as NextFunction);

    expect(activeRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(activeRequestId).not.toBe('attacker-controlled');
    expect(headers.get('x-request-id')).toBe(activeRequestId);
  });

  it('keeps concurrent request ids isolated', async () => {
    const requestContext = new RequestContextService();
    const first = requestContext.run('request-a', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return requestContext.getRequestId();
    });
    const second = requestContext.run('request-b', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return requestContext.getRequestId();
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['request-a', 'request-b']);
  });
});
