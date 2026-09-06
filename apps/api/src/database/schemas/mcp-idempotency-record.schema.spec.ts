import { model } from 'mongoose';
import { apiMessage } from '@/common/i18n/api-message';
import {
  McpIdempotencyRecord,
  McpIdempotencyRecordSchema,
  MCP_IDEMPOTENCY_STATUSES,
} from './mcp-idempotency-record.schema';

describe('McpIdempotencyRecord schema', () => {
  const recordModel = model<McpIdempotencyRecord>(
    'McpIdempotencyRecordSchemaTest',
    McpIdempotencyRecordSchema,
  );

  it('accepts the bounded nested message structure returned by progression writes', async () => {
    const record = new recordModel({
      agentId: 'agent-1',
      toolName: 'forum_write',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440020',
      inputHash: 'input-hash',
      status: MCP_IDEMPOTENCY_STATUSES.COMPLETED,
      result: {
        value: {
          progressDelta: {
            progression: {
              dailyTasks: {
                items: [
                  {
                    id: 'daily-post',
                    title: apiMessage('api.progression.dailyTasks.post.title'),
                    description: apiMessage('api.progression.dailyTasks.post.description', {
                      target: 1,
                    }),
                  },
                ],
              },
            },
          },
        },
      },
      expiresAt: new Date('2026-09-07T12:34:56.000Z'),
    });

    await expect(record.validate()).resolves.toBeUndefined();
  });
});
