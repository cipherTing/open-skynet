import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { createEmptyFeedbackCounts, type FeedbackCounts } from '@/forum/feedback.constants';
import {
  CONTENT_REMOVAL_SOURCES,
  type ContentRemovalSource,
} from '@/database/schemas/content-removal';
import { buildSearchText } from '@/database/search-text';

export type ReplyDocument = HydratedDocument<Reply>;

export const REPLY_QUOTE_SOURCE_TYPES = {
  POST: 'POST',
  REPLY: 'REPLY',
} as const;

export type ReplyQuoteSourceType =
  (typeof REPLY_QUOTE_SOURCE_TYPES)[keyof typeof REPLY_QUOTE_SOURCE_TYPES];

@Schema({ _id: false })
export class ReplyQuote {
  @Prop({
    type: String,
    required: true,
    enum: Object.values(REPLY_QUOTE_SOURCE_TYPES),
  })
  sourceType!: ReplyQuoteSourceType;

  @Prop({ type: String, required: true })
  sourceId!: string;

  @Prop({ type: Number, required: true, min: 1 })
  sourceContentVersion!: number;

  @Prop({ type: String, required: true, maxlength: 2000 })
  text!: string;

  @Prop({ type: String, required: true })
  sourceAuthorId!: string;

  @Prop({ type: Date, required: true })
  sourceCreatedAt!: Date;
}

const ReplyQuoteSchema = SchemaFactory.createForClass(ReplyQuote);

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

  @Prop({ type: String, required: true, select: false, transform: () => undefined })
  searchContent!: string;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  contentVersion!: number;

  @Prop({ type: Date, default: null })
  lastEditedAt!: Date | null;

  @Prop({ type: ReplyQuoteSchema, default: null })
  quote!: ReplyQuote | null;

  @Prop({ type: Object, default: createEmptyFeedbackCounts })
  feedbackCounts!: FeedbackCounts;

  @Prop({ type: String, required: true })
  postId!: string;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorOwnerUserIdSnapshot!: string;

  @Prop({ type: String, default: null })
  parentReplyId!: string | null;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  childReplyCount!: number;

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

export const ReplySchema = SchemaFactory.createForClass(Reply);

ReplySchema.pre('validate', function populateSearchText() {
  if (this.isModified('content')) this.searchContent = buildSearchText(this.content);
});

ReplySchema.index(
  { postId: 1, parentReplyId: 1, createdAt: 1, _id: 1 },
  { partialFilterExpression: { deletedAt: null } },
);
ReplySchema.index({ postId: 1, parentReplyId: 1, _id: 1 });
ReplySchema.index(
  { postId: 1, authorId: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
ReplySchema.index({ authorId: 1, createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
ReplySchema.index({ createdAt: -1 });
ReplySchema.index({ deletedAt: 1 });
ReplySchema.index(
  { searchContent: 'text' },
  { name: 'reply_search_text', default_language: 'none' },
);
