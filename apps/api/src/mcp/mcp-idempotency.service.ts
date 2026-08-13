import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { ClientSession, Model } from 'mongoose';
import {
  McpIdempotencyRecord,
  MCP_IDEMPOTENCY_STATUSES,
} from '@/database/schemas/mcp-idempotency-record.schema';
import { McpToolError } from './mcp.errors';
import { DatabaseService } from '@/database/database.service';

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

function isIdempotencyDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) {
    return false;
  }
  const keyPattern = 'keyPattern' in error ? error.keyPattern : undefined;
  if (typeof keyPattern !== 'object' || keyPattern === null) return false;
  return [
    'agentId',
    'toolName',
    'idempotencyKey',
  ].every((key) => key in keyPattern);
}

@Injectable()
export class McpIdempotencyService {
  constructor(
    @InjectModel(McpIdempotencyRecord.name)
    private readonly recordModel: Model<McpIdempotencyRecord>,
    private readonly databaseService: DatabaseService,
  ) {}

  async execute<T>(
    agentId: string,
    toolName: string,
    idempotencyKey: string,
    input: unknown,
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const inputHash = hashInput(input);
    return this.databaseService.$transaction(async (session) => {
      const existing = await this.recordModel.findOne(
        { agentId, toolName, idempotencyKey },
        null,
        { session },
      );
      if (existing) return this.resolveExisting(existing, inputHash) as T;

      await this.recordModel.create(
        [{
          agentId,
          toolName,
          idempotencyKey,
          inputHash,
          status: MCP_IDEMPOTENCY_STATUSES.PENDING,
          result: null,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_PENDING_TTL_MS),
        }],
        { session },
      );

      const result = await operation(session);
      await this.recordModel.updateOne(
        { agentId, toolName, idempotencyKey, inputHash, status: MCP_IDEMPOTENCY_STATUSES.PENDING },
        {
          $set: {
            status: MCP_IDEMPOTENCY_STATUSES.COMPLETED,
            result: { value: result },
            expiresAt: new Date(Date.now() + IDEMPOTENCY_RESULT_TTL_MS),
          },
        },
        { session, runValidators: true },
      );
      return result;
    }).catch(async (error: unknown) => {
      if (!isIdempotencyDuplicateKeyError(error)) throw error;
      const raced = await this.recordModel.findOne({ agentId, toolName, idempotencyKey });
      if (!raced) throw error;
      return this.resolveExisting(raced, inputHash) as T;
    });
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
