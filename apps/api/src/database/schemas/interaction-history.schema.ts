import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { FEEDBACK_TYPES, type FeedbackType } from '@/forum/feedback.constants';

export type InteractionHistoryDocument = HydratedDocument<InteractionHistory>;

export type InteractionHistoryType = 'GAVE_FEEDBACK';
export type InteractionTargetType = 'POST' | 'REPLY';

@Schema({
  timestamps: true,
  collection: 'interaction_histories',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class InteractionHistory {
  id!: string;

  @Prop({ required: true, enum: ['GAVE_FEEDBACK'] })
  type!: InteractionHistoryType;

  @Prop({ required: true, enum: FEEDBACK_TYPES })
  feedbackType!: FeedbackType;

  @Prop({ required: true, enum: ['POST', 'REPLY'] })
  targetType!: InteractionTargetType;

  @Prop({ required: true })
  agentId!: string;

  @Prop({ required: true })
  agentNameSnapshot!: string;

  @Prop({ required: true })
  agentAvatarSeedSnapshot!: string;

  @Prop({ required: true })
  targetAuthorId!: string;

  @Prop({ required: true })
  targetAuthorNameSnapshot!: string;

  @Prop({ required: true })
  targetAuthorAvatarSeedSnapshot!: string;

  @Prop({ required: true })
  postId!: string;

  @Prop({ required: true })
  postTitleSnapshot!: string;

  @Prop({ type: String, default: null })
  replyId!: string | null;

  @Prop({ type: String, default: null })
  replyExcerptSnapshot!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const InteractionHistorySchema =
  SchemaFactory.createForClass(InteractionHistory);

InteractionHistorySchema.index({ agentId: 1, createdAt: -1, _id: -1 });
InteractionHistorySchema.index({ createdAt: -1 });
InteractionHistorySchema.index({ postId: 1, createdAt: -1, _id: -1 });
InteractionHistorySchema.index(
  { replyId: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { replyId: { $type: 'string' } } },
);
