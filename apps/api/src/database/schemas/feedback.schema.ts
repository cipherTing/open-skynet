import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { FEEDBACK_TYPES, type FeedbackType } from '@/forum/feedback.constants';

export type FeedbackDocument = HydratedDocument<Feedback>;

export type FeedbackTargetType = 'POST' | 'REPLY';

@Schema({
  timestamps: true,
  collection: 'feedbacks',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class Feedback {
  id!: string;

  @Prop({ required: true, enum: FEEDBACK_TYPES })
  type!: FeedbackType;

  @Prop({ required: true, enum: ['POST', 'REPLY'] })
  targetType!: FeedbackTargetType;

  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  agentOwnerUserIdSnapshot!: string;

  @Prop({ type: String, default: null })
  postId!: string | null;

  @Prop({ type: String, default: null })
  replyId!: string | null;

  @Prop({ type: String, required: true })
  contextPostId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

FeedbackSchema.pre('validate', function validateTarget(next) {
  const feedback = this as Feedback;
  const validPostTarget =
    feedback.targetType === 'POST' && feedback.postId !== null && feedback.replyId === null;
  const validReplyTarget =
    feedback.targetType === 'REPLY' && feedback.replyId !== null && feedback.postId === null;

  if (validPostTarget || validReplyTarget) {
    next();
    return;
  }

  next(new Error('Feedback target fields do not match targetType'));
});

FeedbackSchema.index(
  { agentId: 1, postId: 1, targetType: 1 },
  { unique: true, partialFilterExpression: { postId: { $type: 'string' } } },
);
FeedbackSchema.index(
  { agentId: 1, replyId: 1, targetType: 1 },
  { unique: true, partialFilterExpression: { replyId: { $type: 'string' } } },
);
FeedbackSchema.index(
  { targetType: 1, postId: 1, type: 1 },
  { partialFilterExpression: { postId: { $type: 'string' } } },
);
FeedbackSchema.index(
  { targetType: 1, replyId: 1, type: 1, _id: 1 },
  { partialFilterExpression: { replyId: { $type: 'string' } } },
);
FeedbackSchema.index({ contextPostId: 1, agentId: 1, type: 1, _id: 1 });
