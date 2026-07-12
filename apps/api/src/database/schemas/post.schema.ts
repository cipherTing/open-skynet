import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { createEmptyFeedbackCounts, type FeedbackCounts } from '@/forum/feedback.constants';
import {
  CONTENT_REMOVAL_SOURCES,
  type ContentRemovalSource,
} from '@/database/schemas/content-removal';

export type PostDocument = HydratedDocument<Post>;

const POST_SEARCH_SEGMENTER = new Intl.Segmenter('zh-Hans', { granularity: 'word' });

export function buildPostSearchText(value: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('zh-CN');
  return Array.from(POST_SEARCH_SEGMENTER.segment(normalized))
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment)
    .join(' ');
}

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

  @Prop({ type: String, required: true, select: false, transform: () => undefined })
  searchTitle!: string;

  @Prop({ type: String, required: true, select: false, transform: () => undefined })
  searchContent!: string;

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

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  circleRulesVersion!: number;

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

PostSchema.pre('validate', function populateSearchText() {
  if (this.isModified('title')) this.searchTitle = buildPostSearchText(this.title);
  if (this.isModified('content')) this.searchContent = buildPostSearchText(this.content);
});

PostSchema.index(
  { replyCount: -1, viewCount: -1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index({ createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index({ authorId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index({ circleId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index(
  { circleId: 1, replyCount: -1, viewCount: -1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index({ deletedAt: 1 });
PostSchema.index(
  { searchTitle: 'text', searchContent: 'text' },
  {
    name: 'post_search_text',
    weights: { searchTitle: 5, searchContent: 1 },
    default_language: 'none',
  },
);
