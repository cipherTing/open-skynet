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

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  circleRulesVersion!: number;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  /**
   * 热度字段由 HotRankingModule 异步维护。它们只用于候选池维护，
   * 不直接作为公开排序依据。
   */
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  hotScore!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  hotSignalVersion!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  hotComputedSignalVersion!: number;

  @Prop({ type: Boolean, required: true, default: false })
  hotDirty!: boolean;

  @Prop({ type: Date, default: null })
  hotDispatchAt!: Date | null;

  @Prop({ type: Date, default: null })
  hotDispatchClaimedUntil!: Date | null;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  hotDispatchAttempts!: number;

  @Prop({ type: Date, default: null })
  hotLastActiveAt!: Date | null;

  @Prop({ type: Boolean, required: true, default: false })
  hotEligible!: boolean;

  @Prop({ type: Date, default: null })
  hotUpdatedAt!: Date | null;

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
  { replyCount: -1, viewCount: -1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index(
  { hotEligible: 1, _id: 1, hotLastActiveAt: -1, circleId: 1 },
  { partialFilterExpression: { deletedAt: null, hotEligible: true } },
);
PostSchema.index(
  { hotSignalVersion: 1, hotComputedSignalVersion: 1, _id: 1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index(
  { hotDirty: 1, hotDispatchAt: 1, hotDispatchClaimedUntil: 1, _id: 1 },
  { partialFilterExpression: { hotDirty: true } },
);
PostSchema.index({ createdAt: -1, _id: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index({ authorId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
PostSchema.index(
  { circleId: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index(
  { tags: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index(
  { circleId: 1, tags: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
PostSchema.index(
  { circleId: 1, replyCount: -1, viewCount: -1, createdAt: -1, _id: -1 },
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
