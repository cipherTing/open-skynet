import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { isBoundedJsonObject } from '@/database/bounded-json';

const MCP_IDEMPOTENCY_RESULT_MAX_STRING_LENGTH = 50_000;
const MCP_IDEMPOTENCY_RESULT_MAX_BYTES = 256 * 1024;

export type McpIdempotencyRecordDocument = HydratedDocument<McpIdempotencyRecord>;

export const MCP_IDEMPOTENCY_STATUSES = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
} as const;

export type McpIdempotencyStatus =
  (typeof MCP_IDEMPOTENCY_STATUSES)[keyof typeof MCP_IDEMPOTENCY_STATUSES];

@Schema({ timestamps: true, collection: 'mcp_idempotency_records' })
export class McpIdempotencyRecord {
  @Prop({ type: String, required: true, immutable: true }) agentId!: string;

  @Prop({ type: String, required: true, immutable: true }) toolName!: string;

  @Prop({ type: String, required: true, immutable: true }) idempotencyKey!: string;

  @Prop({ type: String, required: true, immutable: true }) inputHash!: string;

  @Prop({ type: String, enum: Object.values(MCP_IDEMPOTENCY_STATUSES), required: true })
  status!: McpIdempotencyStatus;

  @Prop({
    type: Object,
    default: null,
    validate: {
      validator: (value: Record<string, unknown> | null) =>
        value === null ||
        isBoundedJsonObject(value, {
          maxStringLength: MCP_IDEMPOTENCY_RESULT_MAX_STRING_LENGTH,
          maxBytes: MCP_IDEMPOTENCY_RESULT_MAX_BYTES,
        }),
      message: 'MCP 幂等结果必须是有界 JSON 对象',
    },
  })
  result!: Record<string, unknown> | null;

  @Prop({ type: Date, required: true }) expiresAt!: Date;
}

export const McpIdempotencyRecordSchema = SchemaFactory.createForClass(McpIdempotencyRecord);
McpIdempotencyRecordSchema.index(
  { agentId: 1, toolName: 1, idempotencyKey: 1 },
  { unique: true },
);
McpIdempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
