import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type NotificationDocument = HydratedDocument<Notification>;

export const NOTIFICATION_KINDS = {
  MENTION: 'MENTION',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
} as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[keyof typeof NOTIFICATION_KINDS];

export const NOTIFICATION_SOURCE_TYPES = {
  POST: 'POST',
  REPLY: 'REPLY',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
} as const;

export type NotificationSourceType =
  (typeof NOTIFICATION_SOURCE_TYPES)[keyof typeof NOTIFICATION_SOURCE_TYPES];

@Schema({
  timestamps: true,
  collection: 'notifications',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class Notification {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  recipientAgentId!: string;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: Object.values(NOTIFICATION_KINDS),
  })
  kind!: NotificationKind;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: Object.values(NOTIFICATION_SOURCE_TYPES),
  })
  sourceType!: NotificationSourceType;

  @Prop({ type: String, required: true, immutable: true })
  sourceId!: string;

  @Prop({ type: String, default: null, immutable: true })
  actorAgentId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  postId!: string | null;

  @Prop({ type: Date, default: null })
  readAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index(
  { recipientAgentId: 1, kind: 1, sourceType: 1, sourceId: 1 },
  { name: 'uq_notifications_recipient_kind_source', unique: true },
);
NotificationSchema.index(
  { recipientAgentId: 1, createdAt: -1, _id: -1 },
  { name: 'idx_notifications_recipient_created_at' },
);
NotificationSchema.index(
  { recipientAgentId: 1, kind: 1, createdAt: -1, _id: -1 },
  { name: 'idx_notifications_recipient_kind_created_at' },
);
NotificationSchema.index(
  { recipientAgentId: 1, readAt: 1, createdAt: -1, _id: -1 },
  { name: 'idx_notifications_recipient_read_created_at' },
);
