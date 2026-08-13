import { createHash } from 'node:crypto';
import { MCP_IDEMPOTENCY_STATUSES } from '@/database/schemas/mcp-idempotency-record.schema';
import { McpIdempotencyService } from './mcp-idempotency.service';

const INPUT_HASH = createHash('sha256').update('{"title":"same"}').digest('hex');

describe('McpIdempotencyService', () => {
  function createDatabaseService() {
    const session = { id: 'session-1' };
    return {
      session,
      $transaction: jest.fn(async (callback: (value: typeof session) => Promise<unknown>) =>
        callback(session),
      ),
    };
  }

  it('returns the stored result for the same input without executing twice', async () => {
    let stored: Record<string, unknown> | null = null;
    const findOne = jest.fn().mockImplementation(async () => stored);
    const create = jest.fn().mockImplementation(async (records: Array<Record<string, unknown>>) => {
      const record = records[0];
      stored = {
        ...record,
        status: MCP_IDEMPOTENCY_STATUSES.COMPLETED,
        result: { value: { created: true } },
      };
    });
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const recordModel = {
      findOne,
      create,
      updateOne,
    };
    const databaseService = createDatabaseService();
    const service = new McpIdempotencyService(recordModel as never, databaseService as never);
    const operation = jest.fn().mockResolvedValue({ created: true });

    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, operation),
    ).resolves.toEqual({ created: true });
    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, operation),
    ).resolves.toEqual({ created: true });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(databaseService.$transaction).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(
      [expect.objectContaining({ status: MCP_IDEMPOTENCY_STATUSES.PENDING })],
      expect.objectContaining({ session: databaseService.session }),
    );
    expect(updateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $set: expect.objectContaining({ status: MCP_IDEMPOTENCY_STATUSES.COMPLETED }) }),
      expect.objectContaining({ session: databaseService.session, runValidators: true }),
    );
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
    const service = new McpIdempotencyService(recordModel as never, createDatabaseService() as never);

    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, async () => ({ created: true })),
    ).rejects.toMatchObject({
      code: 'MCP_OPERATION_IN_PROGRESS',
      details: expect.objectContaining({ retryAfterSeconds: expect.any(Number) }),
    });
  });

  it('does not persist a failed idempotency record when the operation rejects', async () => {
    const recordModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      updateOne: jest.fn(),
    };
    const service = new McpIdempotencyService(recordModel as never, createDatabaseService() as never);
    const failure = new Error('The post was not found.');

    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(recordModel.updateOne).not.toHaveBeenCalled();
  });

  it('does not leave a pending record when the business operation rolls back', async () => {
    const databaseService = createDatabaseService();
    const recordModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const service = new McpIdempotencyService(recordModel as never, databaseService as never);
    const failure = new Error('business failure');

    await expect(
      service.execute('agent-1', 'create_post', 'key-1', { title: 'same' }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(recordModel.updateOne).not.toHaveBeenCalled();
  });
});
