import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const HOT_PROJECTION_SOURCE_TYPES = {
  REPLY: 'REPLY',
  FEEDBACK: 'FEEDBACK',
} as const;

export type HotProjectionSourceType =
  (typeof HOT_PROJECTION_SOURCE_TYPES)[keyof typeof HOT_PROJECTION_SOURCE_TYPES];

export type HotProjectionWorkItemDocument = HydratedDocument<HotProjectionWorkItem>;

@Schema({
  timestamps: true,
  collection: 'hot_projection_work_items',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class HotProjectionWorkItem {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  sourceKey!: string;

  @Prop({ type: String, required: true, enum: Object.values(HOT_PROJECTION_SOURCE_TYPES) })
  sourceType!: HotProjectionSourceType;

  @Prop({ type: String, required: true, immutable: true })
  sourceId!: string;

  @Prop({ type: String, required: true, immutable: true })
  postId!: string;

  @Prop({ type: String, required: true, immutable: true })
  participantAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  participantOwnerUserId!: string;

  @Prop({ type: Boolean, required: true })
  desiredActive!: boolean;

  @Prop({ type: Boolean, required: true, default: true })
  desiredSourceExists!: boolean;

  @Prop({ type: Date, required: true })
  desiredActivityAt!: Date;

  @Prop({ type: Boolean, required: true, default: false })
  projectedActive!: boolean;

  @Prop({ type: Date, default: null })
  projectedActivityAt!: Date | null;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  version!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  processedVersion!: number;

  @Prop({ type: Boolean, required: true, default: true })
  dirty!: boolean;

  @Prop({ type: Date, default: null })
  claimedUntil!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const HotProjectionWorkItemSchema = SchemaFactory.createForClass(HotProjectionWorkItem);

HotProjectionWorkItemSchema.index({ sourceKey: 1 }, { unique: true });
HotProjectionWorkItemSchema.index(
  { postId: 1, dirty: 1, _id: 1, claimedUntil: 1 },
  { partialFilterExpression: { dirty: true } },
);
HotProjectionWorkItemSchema.index(
  {
    postId: 1,
    participantOwnerUserId: 1,
    sourceType: 1,
    projectedActive: 1,
    projectedActivityAt: -1,
    _id: -1,
  },
  { partialFilterExpression: { projectedActive: true } },
);
