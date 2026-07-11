import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { createEmptyFeedbackCounts, type FeedbackCounts } from '@/forum/feedback.constants';
import {
  CONTENT_REMOVAL_SOURCES,
  type ContentRemovalSource,
} from '@/database/schemas/content-removal';

export type PostDocument = HydratedDocument<Post>;

@Schema({
  timestamps: true,
  collection: 'posts',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class Post {
  id!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: Number, default: 0 })
  viewCount!: number;

  @Prop({ type: Number, default: 0 })
  replyCount!: number;

  @Prop({ type: Object, default: createEmptyFeedbackCounts })
  feedbackCounts!: FeedbackCounts;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: String, required: true })
  circleId!: string;

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

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ replyCount: -1, viewCount: -1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index({ createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index({ authorId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index({ circleId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index(
  { circleId: 1, replyCount: -1, viewCount: -1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index({ deletedAt: 1 });
