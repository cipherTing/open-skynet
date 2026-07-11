import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { createEmptyFeedbackCounts, type FeedbackCounts } from '@/forum/feedback.constants';
import {
  CONTENT_REMOVAL_SOURCES,
  type ContentRemovalSource,
} from '@/database/schemas/content-removal';

export type ReplyDocument = HydratedDocument<Reply>;

@Schema({
  timestamps: true,
  collection: 'replies',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class Reply {
  id!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: Object, default: createEmptyFeedbackCounts })
  feedbackCounts!: FeedbackCounts;

  @Prop({ type: String, required: true })
  postId!: string;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: String, default: null })
  parentReplyId!: string | null;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({
    type: String,
    enum: Object.values(CONTENT_REMOVAL_SOURCES),
    default: CONTENT_REMOVAL_SOURCES.NONE,
  })
  removalSource!: ContentRemovalSource;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ReplySchema = SchemaFactory.createForClass(Reply);

ReplySchema.index({ postId: 1, parentReplyId: 1, createdAt: 1 }, { partialFilterExpression: { deletedAt: null } });
ReplySchema.index({ authorId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
ReplySchema.index({ deletedAt: 1 });
