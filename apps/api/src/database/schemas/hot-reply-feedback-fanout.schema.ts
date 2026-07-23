import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type HotReplyFeedbackFanoutDocument = HydratedDocument<HotReplyFeedbackFanout>;

@Schema({
  timestamps: true,
  collection: 'hot_reply_feedback_fanouts',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class HotReplyFeedbackFanout {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  replyId!: string;

  @Prop({ type: String, required: true, immutable: true })
  postId!: string;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  version!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  processedVersion!: number;

  @Prop({ type: String, default: null })
  cursorFeedbackId!: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  dirty!: boolean;

  @Prop({ type: Date, default: null })
  claimedUntil!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const HotReplyFeedbackFanoutSchema = SchemaFactory.createForClass(HotReplyFeedbackFanout);

HotReplyFeedbackFanoutSchema.index({ replyId: 1 }, { unique: true });
HotReplyFeedbackFanoutSchema.index(
  { postId: 1, dirty: 1, _id: 1, claimedUntil: 1 },
  { partialFilterExpression: { dirty: true } },
);
