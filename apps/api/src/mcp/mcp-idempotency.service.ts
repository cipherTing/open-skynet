import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';
import {
  McpIdempotencyRecord,
  MCP_IDEMPOTENCY_STATUSES,
} from '@/database/schemas/mcp-idempotency-record.schema';
import { McpToolError, normalizeMcpError } from './mcp.errors';

const IDEMPOTENCY_PENDING_TTL_MS = 15 * 60 * 1000;
const IDEMPOTENCY_RESULT_TTL_MS = 24 * 60 * 60 * 1000;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
}

function hashInput(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

@Injectable()
export class McpIdempotencyService {
  constructor(
    @InjectModel(McpIdempotencyRecord.name)
    private readonly recordModel: Model<McpIdempotencyRecord>,
  ) {}

  async execute<T>(
    agentId: string,
    toolName: string,
    idempotencyKey: string,
    input: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    const inputHash = hashInput(input);
    const existing = await this.recordModel.findOne({ agentId, toolName, idempotencyKey });
    if (existing) return this.resolveExisting(existing, inputHash) as T;

    try {
      await this.recordModel.create({
        agentId,
        toolName,
        idempotencyKey,
        inputHash,
        status: MCP_IDEMPOTENCY_STATUSES.PENDING,
        result: null,
        error: null,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_PENDING_TTL_MS),
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await this.recordModel.findOne({ agentId, toolName, idempotencyKey });
      if (!raced) throw error;
      return this.resolveExisting(raced, inputHash) as T;
    }

    try {
      const result = await operation();
      await this.recordModel.updateOne(
        { agentId, toolName, idempotencyKey, inputHash, status: MCP_IDEMPOTENCY_STATUSES.PENDING },
        {
          $set: {
            status: MCP_IDEMPOTENCY_STATUSES.COMPLETED,
            result: { value: result },
            expiresAt: new Date(Date.now() + IDEMPOTENCY_RESULT_TTL_MS),
          },
        },
      );
      return result;
    } catch (error) {
      const normalized = normalizeMcpError(error);
      await this.recordModel.updateOne(
        { agentId, toolName, idempotencyKey, inputHash, status: MCP_IDEMPOTENCY_STATUSES.PENDING },
        {
          $set: {
            status: MCP_IDEMPOTENCY_STATUSES.FAILED,
            error: {
              code: normalized.code,
              message: normalized.message,
              ...(normalized.details.retryAfterSeconds !== undefined
                ? { retryAfterSeconds: normalized.details.retryAfterSeconds }
                : {}),
            },
            expiresAt: new Date(Date.now() + IDEMPOTENCY_RESULT_TTL_MS),
          },
        },
      );
      throw error;
    }
  }

  private resolveExisting(record: McpIdempotencyRecord, inputHash: string): unknown {
    if (record.inputHash !== inputHash) {
      throw new McpToolError(
        'MCP_IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was already used with different input.',
      );
    }
    if (record.status === MCP_IDEMPOTENCY_STATUSES.COMPLETED) {
      return record.result?.value;
    }
    if (record.status === MCP_IDEMPOTENCY_STATUSES.FAILED) {
      const error = record.error;
      const code = typeof error?.code === 'string' ? error.code : 'MCP_OPERATION_RECORDED_FAILED';
      const message =
        typeof error?.message === 'string' ? error.message : 'The previous operation failed.';
      const retryAfterSeconds = error?.retryAfterSeconds;
      throw new McpToolError(
        code,
        message,
        typeof retryAfterSeconds === 'number' ? { retryAfterSeconds } : {},
      );
    }
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((record.expiresAt.getTime() - Date.now()) / 1000),
    );
    throw new McpToolError(
      'MCP_OPERATION_IN_PROGRESS',
      'The same operation is still in progress; retry with the same idempotency key later.',
      { retryAfterSeconds },
    );
  }
}
