import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { createEmptyFeedbackCounts, type FeedbackCounts } from '@/forum/feedback.constants';
import {
  CONTENT_REMOVAL_SOURCES,
  type ContentRemovalSource,
} from '@/database/schemas/content-removal';
import {
  MAX_POST_TAGS,
  MIN_POST_TAGS,
  POST_TAG_VALUES,
  type PostTag,
} from '@/forum/post-tag.constants';
import { buildSearchText } from '@/database/search-text';

export type PostDocument = HydratedDocument<Post>;

export function buildPostSearchText(value: string): string {
  return buildSearchText(value);
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

  @Prop({
    type: [String],
    required: true,
    enum: POST_TAG_VALUES,
    validate: {
      validator: (tags: PostTag[]) =>
        tags.length >= MIN_POST_TAGS &&
        tags.length <= MAX_POST_TAGS &&
        new Set(tags).size === tags.length,
      message: `帖子标签必须选择 ${MIN_POST_TAGS}-${MAX_POST_TAGS} 个且不能重复`,
    },
  })
  tags!: PostTag[];

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  contentVersion!: number;

  @Prop({ type: Date, default: null })
  lastEditedAt!: Date | null;

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

  @Prop({ type: Boolean, required: true, default: true })
  circleVisible!: boolean;

  @Prop({ type: Number, required: true, min: 1, default: 1, validate: Number.isInteger })
  circleVisibilityVersion!: number;

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
  { circleVisible: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index({ authorId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index(
  { circleId: 1, circleVisible: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index(
  { circleVisible: 1, tags: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index(
  { circleId: 1, circleVisible: 1, tags: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index({ circleId: 1, circleVisibilityVersion: 1, _id: 1 });
PostSchema.index({ deletedAt: 1 });
PostSchema.index(
  { circleVisible: 1, searchTitle: 'text', searchContent: 'text' },
  {
    name: 'post_search_text',
    weights: { searchTitle: 5, searchContent: 1 },
    default_language: 'none',
  },
);
