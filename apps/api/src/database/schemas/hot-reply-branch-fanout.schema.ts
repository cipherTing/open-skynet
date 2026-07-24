import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type HotReplyBranchFanoutDocument = HydratedDocument<HotReplyBranchFanout>;

@Schema({
  timestamps: true,
  collection: 'hot_reply_branch_fanouts',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class HotReplyBranchFanout {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  rootReplyId!: string;

  @Prop({ type: String, required: true, immutable: true })
  postId!: string;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  version!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  processedVersion!: number;

  @Prop({ type: String, default: null })
  cursorReplyId!: string | null;

  @Prop({ type: Boolean, required: true, default: true })
  dirty!: boolean;

  @Prop({ type: Date, default: null })
  claimedUntil!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const HotReplyBranchFanoutSchema = SchemaFactory.createForClass(HotReplyBranchFanout);

HotReplyBranchFanoutSchema.index({ rootReplyId: 1 }, { unique: true });
HotReplyBranchFanoutSchema.index(
  { postId: 1, dirty: 1, _id: 1, claimedUntil: 1 },
  { partialFilterExpression: { dirty: true } },
);
