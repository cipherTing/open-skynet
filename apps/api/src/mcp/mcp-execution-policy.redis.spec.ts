import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import request from 'supertest';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { RedisService } from '@/redis/redis.service';
import { USER_ROLES } from '@/database/schemas/user.schema';
import {
  McpExecutionPolicyService,
  type McpRequestAdmission,
} from './mcp-execution-policy.service';
import { registerMcpHttpRoute } from './mcp-http-route';

const describeWithRedis = process.env.RUN_MCP_REDIS_INTEGRATION === '1' ? describe : describe.skip;

describeWithRedis('MCP execution policy with Redis', () => {
  let redisService: RedisService;
  let serviceA: McpExecutionPolicyService;
  let serviceB: McpExecutionPolicyService;
  const agentIds = new Set<string>();

  beforeAll(async () => {
    redisService = new RedisService();
    const redis = redisService.getClient();
    if (redis.status !== 'ready') {
      await once(redis, 'ready', { signal: AbortSignal.timeout(5_000) });
    }
    serviceA = new McpExecutionPolicyService(redisService);
    serviceB = new McpExecutionPolicyService(redisService);
  });

  afterAll(async () => {
    try {
      const redis = redisService.getClient();
      if (redis.status !== 'ready') return;

      for (const agentId of agentIds) {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(
            cursor,
            'MATCH',
            `mcp:policy:{${agentId}}:*`,
            'COUNT',
            100,
          );
          cursor = nextCursor;
          if (keys.length > 0) await redis.del(...keys);
        } while (cursor !== '0');
      }
    } finally {
      await redisService.onModuleDestroy();
    }
  });

  function createPrincipal() {
    const agentId = `redis-test-${randomUUID()}`;
    agentIds.add(agentId);
    return {
      authType: 'agent' as const,
      agentId,
      userId: `owner-${randomUUID()}`,
      username: 'redis-test-agent',
      dbTokenVersion: 0,
      payloadTokenVersion: 0,
      role: USER_ROLES.USER,
    };
  }

  it('enforces four shared Tool permits across service instances without charging the rejection', async () => {
    const principal = createPrincipal();
    const toolCall = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'forum_read', arguments: {} },
    };

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_value, index) =>
        (index % 2 === 0 ? serviceA : serviceB).admitRequest(principal, toolCall),
      ),
    );
    const admitted = results
      .filter(
        (result): result is PromiseFulfilledResult<McpRequestAdmission> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(admitted).toHaveLength(4);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'MCP_CONCURRENCY_LIMITED' });

    const rateKey = `mcp:policy:{${principal.agentId}}:rate`;
    const tokensBeforeRetry = await redisService.getClient().hget(rateKey, 'tokens');
    await expect(serviceA.admitRequest(principal, toolCall)).rejects.toMatchObject({
      code: 'MCP_CONCURRENCY_LIMITED',
    });
    expect(await redisService.getClient().hget(rateKey, 'tokens')).toBe(tokensBeforeRetry);

    await Promise.all(admitted.map((admission) => admission.toolPermit?.releaseIfUnused()));
  });

  it('allows only one cross-instance subscription per Agent and protects the new token from old release', async () => {
    const principal = createPrincipal();
    const subscription = {
      jsonrpc: '2.0',
      id: 1,
      method: 'subscriptions/listen',
      params: {},
    };

    const first = await serviceA.admitRequest(principal, subscription);
    await expect(serviceB.admitRequest(principal, subscription)).rejects.toMatchObject({
      code: 'MCP_SUBSCRIPTION_LIMITED',
    });

    await first.subscriptionLease?.release();
    const second = await serviceB.admitRequest(principal, subscription);
    await first.subscriptionLease?.release();

    await expect(serviceA.admitRequest(principal, subscription)).rejects.toMatchObject({
      code: 'MCP_SUBSCRIPTION_LIMITED',
    });
    await second.subscriptionLease?.release();
  });

  it('returns HTTP 429 with Retry-After before a real SDK Tool callback runs', async () => {
    const principal = createPrincipal();
    let toolExecutions = 0;
    const sdkHandler = createMcpHandler(
      () => {
        const server = new McpServer({ name: 'redis-route-test', version: '1.0.0' });
        server.registerTool(
          'forum_write',
          {
            description: 'Redis route acceptance Tool.',
            inputSchema: z.object({}),
          },
          async () => {
            toolExecutions += 1;
            return { content: [{ type: 'text', text: 'executed' }] };
          },
        );
        return server;
      },
      { legacy: 'stateless', responseMode: 'auto' },
    );
    const app = express();
    registerMcpHttpRoute(
      app,
      {
        authenticate: async () => principal,
        getNodeHandler: () => toNodeHandler(sdkHandler),
      } as never,
      serviceA,
    );
    const toolCall = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'forum_write', arguments: {} },
    };
    const redis = redisService.getClient();
    const rateKey = `mcp:policy:{${principal.agentId}}:rate`;
    const [seconds, microseconds] = await redis.time();
    const redisNowMs = Number(seconds) * 1_000 + Math.floor(Number(microseconds) / 1_000);

    try {
      await redis.hset(rateKey, 'tokens', 120_000, 'updatedAtMs', redisNowMs);
      const allowed = await request(app)
        .post('/api/v1/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send(toolCall);

      expect(allowed.status).toBe(200);
      expect(toolExecutions).toBe(1);

      await redis.hset(rateKey, 'tokens', 0, 'updatedAtMs', redisNowMs + 60_000);
      const denied = await request(app)
        .post('/api/v1/mcp')
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream')
        .send(toolCall);

      expect(denied.status).toBe(429);
      expect(denied.headers['retry-after']).toBe('2');
      expect(denied.body.error.code).toBe('MCP_RATE_LIMITED');
      expect(toolExecutions).toBe(1);
    } finally {
      await sdkHandler.close();
    }
  });
});
