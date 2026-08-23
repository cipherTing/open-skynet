import express from 'express';
import request from 'supertest';
import { McpToolError } from './mcp.errors';
import { registerMcpHttpRoute } from './mcp-http-route';

const PRINCIPAL = {
  authType: 'agent' as const,
  agentId: '507f1f77bcf86cd799439011',
  userId: '507f1f77bcf86cd799439012',
  username: 'agent',
  dbTokenVersion: 0,
  payloadTokenVersion: 0,
  role: 'USER' as const,
};

function buildRoute(
  overrides: {
    authenticate?: jest.Mock;
    admitRequest?: jest.Mock;
    nodeHandler?: jest.Mock;
  } = {},
) {
  const authenticate = overrides.authenticate ?? jest.fn().mockResolvedValue(PRINCIPAL);
  const nodeHandler =
    overrides.nodeHandler ??
    jest.fn(async (_request, response, body) => {
      response.status(200).json({ body });
    });
  const admitRequest =
    overrides.admitRequest ??
    jest.fn().mockResolvedValue({ toolPermit: null, subscriptionLease: null });
  const runWithToolPermit = jest.fn(
    async (_permit: unknown, _requestSignal: AbortSignal, operation: () => Promise<void>) =>
      operation(),
  );
  const app = express();

  registerMcpHttpRoute(
    app,
    {
      authenticate,
      getNodeHandler: () => nodeHandler,
    } as never,
    { admitRequest, runWithToolPermit } as never,
  );
  app.use(express.json({ limit: '256kb' }));

  return { app, authenticate, nodeHandler, admitRequest, runWithToolPermit };
}

describe('MCP HTTP route', () => {
  it('rejects authentication before attempting to parse an invalid JSON body', async () => {
    const authenticate = jest
      .fn()
      .mockRejectedValue(new McpToolError('UNAUTHORIZED', 'A valid Agent Key is required.'));
    const { app, nodeHandler, admitRequest } = buildRoute({ authenticate });

    const response = await request(app)
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'A valid Agent Key is required.' },
    });
    expect(nodeHandler).not.toHaveBeenCalled();
    expect(admitRequest).not.toHaveBeenCalled();
  });

  it('rejects every JSON-RPC batch before admission and executes no message', async () => {
    const { app, nodeHandler, admitRequest } = buildRoute();

    const response = await request(app)
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send([
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forum_read' } },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'forum_write' } },
      ]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'MCP_BATCH_NOT_SUPPORTED',
        message: 'JSON-RPC batch requests are not supported.',
      },
    });
    expect(admitRequest).not.toHaveBeenCalled();
    expect(nodeHandler).not.toHaveBeenCalled();
  });

  it('returns HTTP 429 with Retry-After when weighted Tool admission is denied', async () => {
    const admitRequest = jest.fn().mockRejectedValue(
      new McpToolError('MCP_RATE_LIMITED', 'The MCP request rate limit was exceeded.', {
        retryAfterSeconds: 7,
      }),
    );
    const { app, nodeHandler } = buildRoute({ admitRequest });

    const response = await request(app)
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'forum_read', arguments: {} },
      });

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('7');
    expect(response.body.error.code).toBe('MCP_RATE_LIMITED');
    expect(nodeHandler).not.toHaveBeenCalled();
  });

  it('returns stable parser errors after authentication', async () => {
    const { app, nodeHandler } = buildRoute();

    const invalid = await request(app)
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send('{');
    const oversized = await request(app)
      .post('/api/v1/mcp')
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ payload: 'x'.repeat(300 * 1024) }));

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('MCP_INVALID_JSON');
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe('MCP_BODY_TOO_LARGE');
    expect(nodeHandler).not.toHaveBeenCalled();
  });

  it('runs the SDK inside the Tool permit context and releases an unclaimed permit', async () => {
    const toolPermit = { releaseIfUnused: jest.fn().mockResolvedValue(undefined) };
    const admitRequest = jest.fn().mockResolvedValue({ toolPermit, subscriptionLease: null });
    const { app, runWithToolPermit } = buildRoute({ admitRequest });

    const response = await request(app)
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'forum_read', arguments: {} },
      });

    expect(response.status).toBe(200);
    expect(runWithToolPermit).toHaveBeenCalledWith(
      toolPermit,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(toolPermit.releaseIfUnused).toHaveBeenCalledTimes(1);
  });

  it('releases the per-Agent subscription lease when the stream handler finishes', async () => {
    const subscriptionLease = {
      onLost: jest.fn(),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const admitRequest = jest.fn().mockResolvedValue({ toolPermit: null, subscriptionLease });
    const { app } = buildRoute({ admitRequest });

    const response = await request(app)
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'subscriptions/listen', params: {} });

    expect(response.status).toBe(200);
    expect(subscriptionLease.release).toHaveBeenCalledTimes(1);
  });

  it('lets CORS preflight continue without authentication', async () => {
    const { app, authenticate } = buildRoute();
    app.options('/api/v1/mcp', (_request, response) => response.sendStatus(204));

    const response = await request(app).options('/api/v1/mcp');

    expect(response.status).toBe(204);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
