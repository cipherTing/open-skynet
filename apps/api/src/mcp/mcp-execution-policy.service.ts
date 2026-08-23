import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisService } from '@/redis/redis.service';
import type { McpAgentPrincipal } from './mcp-agent-tools.service';
import { McpToolError } from './mcp.errors';

export const MCP_TOOL_NAMES = [
  'agent_read',
  'agent_update',
  'forum_read',
  'forum_write',
  'forum_interaction',
  'circle_read',
  'circle_write',
  'proposal_read',
  'proposal_write',
  'governance_read',
  'governance_write',
  'report_write',
  'agent_guide_read',
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

interface McpToolPolicy {
  readonly cost: 1 | 2 | 4;
}

export const MCP_TOOL_POLICIES = {
  agent_read: { cost: 2 },
  agent_update: { cost: 4 },
  forum_read: { cost: 2 },
  forum_write: { cost: 4 },
  forum_interaction: { cost: 4 },
  circle_read: { cost: 2 },
  circle_write: { cost: 4 },
  proposal_read: { cost: 2 },
  proposal_write: { cost: 4 },
  governance_read: { cost: 2 },
  governance_write: { cost: 4 },
  report_write: { cost: 4 },
  agent_guide_read: { cost: 1 },
} as const satisfies Record<McpToolName, McpToolPolicy>;

const MCP_PROTOCOL_REQUEST_COST = 1;
const MCP_RATE_CAPACITY_MILLI = 120_000;
const MCP_RATE_REFILL_MILLI_PER_MS = 2;
const MCP_TOOL_CONCURRENCY_LIMIT = 4;
const MCP_TOOL_DEADLINE_MS = 30_000;
const MCP_TOOL_LEASE_TTL_MS = 60_000;
const MCP_TOOL_HEARTBEAT_MS = 15_000;
const MCP_SUBSCRIPTION_LEASE_TTL_MS = 60_000;
const MCP_SUBSCRIPTION_HEARTBEAT_MS = 15_000;
const MCP_IDLE_RATE_STATE_TTL_MS = 120_000;

const ADMISSION_RESULTS = {
  ALLOWED: 'ALLOWED',
  RATE_LIMITED: 'RATE_LIMITED',
  CONCURRENCY_LIMITED: 'CONCURRENCY_LIMITED',
  SUBSCRIPTION_LIMITED: 'SUBSCRIPTION_LIMITED',
} as const;

const RELEASED_LEASE_TOKEN = 'released';

const MCP_ADMISSION_LUA = String.raw`
local nowParts = redis.call('TIME')
local nowMs = tonumber(nowParts[1]) * 1000 + math.floor(tonumber(nowParts[2]) / 1000)
local capacity = tonumber(ARGV[1])
local refillPerMs = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local hasToolLease = ARGV[4] == '1'
local toolLeaseId = ARGV[5]
local toolLeaseTtlMs = tonumber(ARGV[6])
local concurrencyLimit = tonumber(ARGV[7])
local hasSubscriptionLease = ARGV[8] == '1'
local subscriptionToken = ARGV[9]
local subscriptionTtlMs = tonumber(ARGV[10])
local idleRateTtlMs = tonumber(ARGV[11])

local rateState = redis.call('HMGET', KEYS[1], 'tokens', 'updatedAtMs')
local tokens = tonumber(rateState[1])
local updatedAtMs = tonumber(rateState[2])
if tokens == nil or updatedAtMs == nil then
  tokens = capacity
  updatedAtMs = nowMs
else
  local elapsedMs = math.max(0, nowMs - updatedAtMs)
  tokens = math.min(capacity, tokens + elapsedMs * refillPerMs)
end

if tokens < cost then
  local retryMs = math.ceil((cost - tokens) / refillPerMs)
  return { '${ADMISSION_RESULTS.RATE_LIMITED}', retryMs }
end

if hasToolLease then
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', nowMs)
  local activeCount = tonumber(redis.call('ZCARD', KEYS[2]))
  if activeCount >= concurrencyLimit then
    local earliest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
    local retryMs = 1000
    if earliest[2] ~= nil then
      retryMs = math.max(1, tonumber(earliest[2]) - nowMs)
    end
    return { '${ADMISSION_RESULTS.CONCURRENCY_LIMITED}', retryMs }
  end
end

if hasSubscriptionLease and redis.call('EXISTS', KEYS[4]) == 1 then
  return { '${ADMISSION_RESULTS.SUBSCRIPTION_LIMITED}', 0 }
end

redis.call('HSET', KEYS[1], 'tokens', tokens - cost, 'updatedAtMs', nowMs)
redis.call('PEXPIRE', KEYS[1], idleRateTtlMs)

if hasToolLease then
  redis.call('ZADD', KEYS[2], nowMs + toolLeaseTtlMs, toolLeaseId)
  redis.call('PEXPIRE', KEYS[2], toolLeaseTtlMs * 2)
  redis.call('SET', KEYS[3], toolLeaseId, 'PX', toolLeaseTtlMs)
end

if hasSubscriptionLease then
  redis.call('SET', KEYS[4], subscriptionToken, 'PX', subscriptionTtlMs)
end

return { '${ADMISSION_RESULTS.ALLOWED}', 0 }
`;

const MCP_RENEW_TOOL_LEASE_LUA = String.raw`
local current = redis.call('GET', KEYS[2])
if current == '${RELEASED_LEASE_TOKEN}' then
  return 0
end
if current ~= false and current ~= ARGV[1] then
  return 0
end
local nowParts = redis.call('TIME')
local nowMs = tonumber(nowParts[1]) * 1000 + math.floor(tonumber(nowParts[2]) / 1000)
local ttlMs = tonumber(ARGV[2])
redis.call('SET', KEYS[2], ARGV[1], 'PX', ttlMs)
redis.call('ZADD', KEYS[1], nowMs + ttlMs, ARGV[1])
redis.call('PEXPIRE', KEYS[1], ttlMs * 2)
return 1
`;

const MCP_RELEASE_TOOL_LEASE_LUA = String.raw`
local current = redis.call('GET', KEYS[2])
if current ~= false and current ~= ARGV[1] and current ~= '${RELEASED_LEASE_TOKEN}' then
  return 0
end
redis.call('SET', KEYS[2], '${RELEASED_LEASE_TOKEN}', 'PX', ARGV[2])
redis.call('ZREM', KEYS[1], ARGV[1])
return 1
`;

const MCP_RENEW_SUBSCRIPTION_LEASE_LUA = String.raw`
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

const MCP_RELEASE_SUBSCRIPTION_LEASE_LUA = String.raw`
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
return 1
`;

interface McpRequestClassification {
  readonly cost: 1 | 2 | 4;
  readonly toolName: McpToolName | null;
  readonly subscription: boolean;
}

interface McpToolInvocationPermitOptions {
  readonly deadlineMs: number;
  readonly heartbeatMs: number;
  readonly renew: () => Promise<void>;
  readonly release: () => Promise<void>;
  readonly onPolicyUnavailable?: () => void;
  readonly onReleased?: () => void;
}

interface McpSubscriptionLeaseOptions {
  readonly heartbeatMs: number;
  readonly renew: () => Promise<boolean>;
  readonly release: () => Promise<void>;
}

export interface McpRequestAdmission {
  readonly toolPermit: McpToolInvocationPermit | null;
  readonly subscriptionLease: McpSubscriptionLease | null;
}

type AdmissionDecision =
  | typeof ADMISSION_RESULTS.ALLOWED
  | typeof ADMISSION_RESULTS.RATE_LIMITED
  | typeof ADMISSION_RESULTS.CONCURRENCY_LIMITED
  | typeof ADMISSION_RESULTS.SUBSCRIPTION_LIMITED;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMcpToolName(value: unknown): value is McpToolName {
  return typeof value === 'string' && MCP_TOOL_NAMES.some((toolName) => toolName === value);
}

export function classifyMcpRequest(body: unknown): McpRequestClassification {
  if (!isRecord(body)) {
    return { cost: MCP_PROTOCOL_REQUEST_COST, toolName: null, subscription: false };
  }
  if (body.method === 'subscriptions/listen') {
    return { cost: MCP_PROTOCOL_REQUEST_COST, toolName: null, subscription: true };
  }
  if (body.method !== 'tools/call') {
    return { cost: MCP_PROTOCOL_REQUEST_COST, toolName: null, subscription: false };
  }
  if (!isRecord(body.params)) {
    return { cost: 4, toolName: null, subscription: false };
  }
  const toolName = body.params.name;
  if (!isMcpToolName(toolName)) {
    return { cost: 4, toolName: null, subscription: false };
  }
  return {
    cost: MCP_TOOL_POLICIES[toolName].cost,
    toolName,
    subscription: false,
  };
}

function parseAdmissionResult(value: unknown): {
  decision: AdmissionDecision;
  retryAfterMs: number;
} {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('MCP admission script returned an invalid result.');
  }
  const decision = value[0];
  const retryAfterValue = value[1];
  if (
    decision !== ADMISSION_RESULTS.ALLOWED &&
    decision !== ADMISSION_RESULTS.RATE_LIMITED &&
    decision !== ADMISSION_RESULTS.CONCURRENCY_LIMITED &&
    decision !== ADMISSION_RESULTS.SUBSCRIPTION_LIMITED
  ) {
    throw new Error('MCP admission script returned an unknown decision.');
  }
  const retryAfterMs =
    typeof retryAfterValue === 'number'
      ? retryAfterValue
      : typeof retryAfterValue === 'string'
        ? Number(retryAfterValue)
        : Number.NaN;
  if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) {
    throw new Error('MCP admission script returned an invalid retry delay.');
  }
  return { decision, retryAfterMs };
}

function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

interface McpToolExecutionScope {
  readonly permit: McpToolInvocationPermit | null;
  readonly requestSignal: AbortSignal;
}

export class McpToolInvocationPermit {
  private readonly logger = new Logger(McpToolInvocationPermit.name);
  private readonly heartbeat: NodeJS.Timeout;
  private claimed = false;
  private released = false;
  private policyUnavailableError: McpToolError | null = null;
  private rejectPolicyUnavailable: ((error: McpToolError) => void) | null = null;

  constructor(private readonly options: McpToolInvocationPermitOptions) {
    this.heartbeat = setInterval(() => {
      if (this.released) return;
      void this.options.renew().catch((error: unknown) => this.handleRenewalFailure(error));
    }, options.heartbeatMs);
    this.heartbeat.unref();
  }

  async execute<T>(requestSignal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    if (this.claimed || this.released) {
      throw new McpToolError(
        'MCP_POLICY_UNAVAILABLE',
        'The MCP Tool execution permit is no longer available.',
      );
    }
    if (this.policyUnavailableError) throw this.policyUnavailableError;
    this.claimed = true;

    const operationPromise = Promise.resolve().then(operation);
    void operationPromise.then(
      () => this.releaseOnce(),
      () => this.releaseOnce(),
    );

    let deadline: NodeJS.Timeout | undefined;
    let abortListener: (() => void) | undefined;
    const deadlinePromise = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => {
        reject(
          new McpToolError(
            'MCP_TOOL_TIMEOUT',
            'The Tool exceeded the 30-second response deadline and may still complete.',
          ),
        );
      }, this.options.deadlineMs);
      deadline.unref();
    });
    const cancellationPromise = new Promise<never>((_resolve, reject) => {
      abortListener = () => {
        reject(new McpToolError('MCP_TOOL_CANCELLED', 'The MCP Tool request was cancelled.'));
      };
      if (requestSignal.aborted) {
        abortListener();
        return;
      }
      requestSignal.addEventListener('abort', abortListener, { once: true });
    });
    const policyUnavailablePromise = new Promise<never>((_resolve, reject) => {
      this.rejectPolicyUnavailable = reject;
      if (this.policyUnavailableError) reject(this.policyUnavailableError);
    });

    try {
      return await Promise.race([
        operationPromise,
        deadlinePromise,
        cancellationPromise,
        policyUnavailablePromise,
      ]);
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
      if (abortListener !== undefined) {
        requestSignal.removeEventListener('abort', abortListener);
      }
      this.rejectPolicyUnavailable = null;
    }
  }

  async releaseIfUnused(): Promise<void> {
    if (this.claimed) return;
    await this.releaseOnce();
  }

  private async releaseOnce(): Promise<void> {
    if (this.released) return;
    this.released = true;
    clearInterval(this.heartbeat);
    try {
      await this.options.release();
    } catch (error) {
      this.logger.error(
        'MCP Tool concurrency lease release failed.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.options.onReleased?.();
    }
  }

  private handleRenewalFailure(error: unknown): void {
    if (this.released || this.policyUnavailableError) return;
    this.logger.error(
      'MCP Tool concurrency lease renewal failed.',
      error instanceof Error ? error.stack : String(error),
    );
    this.policyUnavailableError = new McpToolError(
      'MCP_POLICY_UNAVAILABLE',
      'The MCP execution policy became unavailable while the Tool was running.',
    );
    this.options.onPolicyUnavailable?.();
    this.rejectPolicyUnavailable?.(this.policyUnavailableError);
  }
}

export class McpSubscriptionLease {
  private readonly logger = new Logger(McpSubscriptionLease.name);
  private readonly heartbeat: NodeJS.Timeout;
  private released = false;
  private lostListener: (() => void) | null = null;

  constructor(private readonly options: McpSubscriptionLeaseOptions) {
    this.heartbeat = setInterval(() => {
      if (this.released) return;
      void this.options
        .renew()
        .then((active) => {
          if (!active) this.loseOwnership();
        })
        .catch((error: unknown) => {
          this.logger.error(
            'MCP subscription lease renewal failed.',
            error instanceof Error ? error.stack : String(error),
          );
          this.loseOwnership();
        });
    }, options.heartbeatMs);
    this.heartbeat.unref();
  }

  onLost(listener: () => void): void {
    this.lostListener = listener;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    clearInterval(this.heartbeat);
    try {
      await this.options.release();
    } catch (error) {
      this.logger.error(
        'MCP subscription lease release failed.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private loseOwnership(): void {
    if (this.released) return;
    this.released = true;
    clearInterval(this.heartbeat);
    this.lostListener?.();
  }
}

@Injectable()
export class McpExecutionPolicyService {
  private readonly logger = new Logger(McpExecutionPolicyService.name);
  private readonly redis: Redis;
  private readonly toolExecutionStorage = new AsyncLocalStorage<McpToolExecutionScope>();
  private readonly activeToolPermits = new Set<McpToolInvocationPermit>();
  private toolAdmissionCircuitOpen = false;

  constructor(redisService: RedisService) {
    this.redis = redisService.getClient();
  }

  runWithToolPermit<T>(
    permit: McpToolInvocationPermit | null,
    requestSignal: AbortSignal,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.toolExecutionStorage.run({ permit, requestSignal }, operation);
  }

  executeTool<T>(operation: () => Promise<T>): Promise<T> {
    const scope = this.toolExecutionStorage.getStore();
    if (!scope?.permit) {
      throw new McpToolError(
        'MCP_POLICY_UNAVAILABLE',
        'The MCP Tool execution policy is not available for this request.',
      );
    }
    return scope.permit.execute(scope.requestSignal, operation);
  }

  async admitRequest(principal: McpAgentPrincipal, body: unknown): Promise<McpRequestAdmission> {
    await this.ensureToolAdmissionCircuitClosed();
    const classification = classifyMcpRequest(body);
    const toolLeaseId = classification.toolName === null ? '' : randomUUID();
    const subscriptionToken = classification.subscription ? randomUUID() : '';
    const keys = this.buildKeys(principal.agentId, toolLeaseId);

    let rawResult: unknown;
    try {
      rawResult = await this.redis.eval(
        MCP_ADMISSION_LUA,
        4,
        keys.rate,
        keys.toolLeases,
        keys.toolLeaseToken,
        keys.subscription,
        MCP_RATE_CAPACITY_MILLI,
        MCP_RATE_REFILL_MILLI_PER_MS,
        classification.cost * 1000,
        classification.toolName === null ? 0 : 1,
        toolLeaseId,
        MCP_TOOL_LEASE_TTL_MS,
        MCP_TOOL_CONCURRENCY_LIMIT,
        classification.subscription ? 1 : 0,
        subscriptionToken,
        MCP_SUBSCRIPTION_LEASE_TTL_MS,
        MCP_IDLE_RATE_STATE_TTL_MS,
      );
    } catch (error) {
      this.logger.error(
        'MCP admission policy failed.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new McpToolError(
        'MCP_POLICY_UNAVAILABLE',
        'The MCP execution policy is temporarily unavailable.',
      );
    }

    let result: ReturnType<typeof parseAdmissionResult>;
    try {
      result = parseAdmissionResult(rawResult);
    } catch (error) {
      this.logger.error(
        'MCP admission policy returned an invalid result.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new McpToolError(
        'MCP_POLICY_UNAVAILABLE',
        'The MCP execution policy is temporarily unavailable.',
      );
    }

    if (result.decision === ADMISSION_RESULTS.RATE_LIMITED) {
      throw new McpToolError('MCP_RATE_LIMITED', 'The MCP request rate limit was exceeded.', {
        retryAfterSeconds: retryAfterSeconds(result.retryAfterMs),
      });
    }
    if (result.decision === ADMISSION_RESULTS.CONCURRENCY_LIMITED) {
      throw new McpToolError(
        'MCP_CONCURRENCY_LIMITED',
        'The MCP Tool concurrency limit was reached.',
        { retryAfterSeconds: retryAfterSeconds(result.retryAfterMs) },
      );
    }
    if (result.decision === ADMISSION_RESULTS.SUBSCRIPTION_LIMITED) {
      throw new McpToolError(
        'MCP_SUBSCRIPTION_LIMITED',
        'This Agent already has an active MCP subscription.',
      );
    }

    const toolPermit =
      classification.toolName === null
        ? null
        : this.createToolPermit(keys.toolLeases, keys.toolLeaseToken, toolLeaseId);
    const subscriptionLease = classification.subscription
      ? new McpSubscriptionLease({
          heartbeatMs: MCP_SUBSCRIPTION_HEARTBEAT_MS,
          renew: () => this.renewSubscriptionLease(keys.subscription, subscriptionToken),
          release: () => this.releaseSubscriptionLease(keys.subscription, subscriptionToken),
        })
      : null;

    return { toolPermit, subscriptionLease };
  }

  private async ensureToolAdmissionCircuitClosed(): Promise<void> {
    if (!this.toolAdmissionCircuitOpen) return;
    if (this.activeToolPermits.size > 0) {
      throw new McpToolError(
        'MCP_POLICY_UNAVAILABLE',
        'The MCP execution policy is temporarily unavailable.',
      );
    }
    try {
      await this.redis.ping();
    } catch (error) {
      this.logger.error(
        'MCP execution policy recovery check failed.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new McpToolError(
        'MCP_POLICY_UNAVAILABLE',
        'The MCP execution policy is temporarily unavailable.',
      );
    }
    this.toolAdmissionCircuitOpen = false;
  }

  private createToolPermit(
    leasesKey: string,
    tokenKey: string,
    leaseId: string,
  ): McpToolInvocationPermit {
    const permit = new McpToolInvocationPermit({
      deadlineMs: MCP_TOOL_DEADLINE_MS,
      heartbeatMs: MCP_TOOL_HEARTBEAT_MS,
      renew: () => this.renewToolLease(leasesKey, tokenKey, leaseId),
      release: () => this.releaseToolLease(leasesKey, tokenKey, leaseId),
      onPolicyUnavailable: () => {
        this.toolAdmissionCircuitOpen = true;
      },
      onReleased: () => {
        this.activeToolPermits.delete(permit);
      },
    });
    this.activeToolPermits.add(permit);
    return permit;
  }

  private buildKeys(agentId: string, toolLeaseId: string) {
    const hashTag = `{${agentId}}`;
    return {
      rate: `mcp:policy:${hashTag}:rate`,
      toolLeases: `mcp:policy:${hashTag}:tool-leases`,
      toolLeaseToken: `mcp:policy:${hashTag}:tool-lease:${toolLeaseId || 'none'}`,
      subscription: `mcp:policy:${hashTag}:subscription`,
    };
  }

  private async renewToolLease(
    leasesKey: string,
    tokenKey: string,
    leaseId: string,
  ): Promise<void> {
    const renewed = await this.redis.eval(
      MCP_RENEW_TOOL_LEASE_LUA,
      2,
      leasesKey,
      tokenKey,
      leaseId,
      MCP_TOOL_LEASE_TTL_MS,
    );
    if (renewed !== 1 && renewed !== '1') {
      throw new Error('The MCP Tool concurrency lease is no longer active.');
    }
  }

  private async releaseToolLease(
    leasesKey: string,
    tokenKey: string,
    leaseId: string,
  ): Promise<void> {
    await this.redis.eval(
      MCP_RELEASE_TOOL_LEASE_LUA,
      2,
      leasesKey,
      tokenKey,
      leaseId,
      MCP_TOOL_LEASE_TTL_MS,
    );
  }

  private async renewSubscriptionLease(key: string, token: string): Promise<boolean> {
    const renewed = await this.redis.eval(
      MCP_RENEW_SUBSCRIPTION_LEASE_LUA,
      1,
      key,
      token,
      MCP_SUBSCRIPTION_LEASE_TTL_MS,
    );
    return renewed === 1 || renewed === '1';
  }

  private async releaseSubscriptionLease(key: string, token: string): Promise<void> {
    await this.redis.eval(MCP_RELEASE_SUBSCRIPTION_LEASE_LUA, 1, key, token);
  }
}
