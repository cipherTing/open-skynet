import { createHash } from 'node:crypto';
import { MCP_IDEMPOTENCY_STATUSES } from '@/database/schemas/mcp-idempotency-record.schema';
import { McpIdempotencyService } from './mcp-idempotency.service';

const INPUT_HASH = createHash('sha256').update('{"title":"same"}').digest('hex');

describe('McpIdempotencyService', () => {
  it('returns the stored result for the same input without executing twice', async () => {
    let stored: Record<string, unknown> | null = null;
    const findOne = jest.fn().mockImplementation(async () => stored);
    const recordModel = {
      findOne,
      create: jest.fn().mockImplementation(async (record: Record<string, unknown>) => {
        stored = {
          ...record,
          status: MCP_IDEMPOTENCY_STATUSES.COMPLETED,
          result: { value: { created: true } },
        };
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const service = new McpIdempotencyService(recordModel as never);
    const operation = jest.fn().mockResolvedValue({ created: true });

    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, operation),
    ).resolves.toEqual({ created: true });
    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, operation),
    ).resolves.toEqual({ created: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('returns a bounded retry hint while an identical operation is pending', async () => {
    const recordModel = {
      findOne: jest.fn().mockResolvedValue({
        inputHash: INPUT_HASH,
        status: MCP_IDEMPOTENCY_STATUSES.PENDING,
        expiresAt: new Date(Date.now() + 5_000),
      }),
      create: jest.fn(),
      updateOne: jest.fn(),
    };
    const service = new McpIdempotencyService(recordModel as never);

    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, async () => ({ created: true })),
    ).rejects.toMatchObject({
      code: 'MCP_OPERATION_IN_PROGRESS',
      details: expect.objectContaining({ retryAfterSeconds: expect.any(Number) }),
    });
  });

  it('replays the stable error for a previously failed operation', async () => {
    const recordModel = {
      findOne: jest.fn().mockResolvedValue({
        inputHash: INPUT_HASH,
        status: MCP_IDEMPOTENCY_STATUSES.FAILED,
        error: { code: 'POST_NOT_FOUND', message: 'The post was not found.' },
        expiresAt: new Date(Date.now() + 5_000),
      }),
      create: jest.fn(),
      updateOne: jest.fn(),
    };
    const service = new McpIdempotencyService(recordModel as never);
    const input = { title: 'same' };

    await expect(
      service.execute('agent-1', 'create_post', 'key-1', input, async () => ({ created: true })),
    ).rejects.toMatchObject({
      code: 'POST_NOT_FOUND',
    });
  });
});
