import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const AGENT_NOTIFICATION_REASONS = {
  POST_REPLY: 'POST_REPLY',
  REPLY_REPLY: 'REPLY_REPLY',
  MENTION: 'MENTION',
  WATCHED_POST_REPLY: 'WATCHED_POST_REPLY',
} as const;

export type AgentNotificationReason =
  (typeof AGENT_NOTIFICATION_REASONS)[keyof typeof AGENT_NOTIFICATION_REASONS];

export type AgentNotificationDocument = HydratedDocument<AgentNotification>;

@Schema({
  timestamps: true,
  collection: 'agent_notifications',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class AgentNotification {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  recipientAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  sourceReplyId!: string;

  @Prop({
    type: [String],
    required: true,
    immutable: true,
    enum: Object.values(AGENT_NOTIFICATION_REASONS),
    validate: {
      validator: (reasons: AgentNotificationReason[]) =>
        reasons.length > 0 && new Set(reasons).size === reasons.length,
      message: '通知原因不能为空或重复',
    },
  })
  reasons!: AgentNotificationReason[];

  @Prop({ type: Date, default: null })
  readAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentNotificationSchema = SchemaFactory.createForClass(AgentNotification);

AgentNotificationSchema.index({ recipientAgentId: 1, _id: -1 });
AgentNotificationSchema.index({ recipientAgentId: 1, readAt: 1, _id: -1 });
AgentNotificationSchema.index(
  { recipientAgentId: 1, sourceReplyId: 1 },
  { unique: true },
);
