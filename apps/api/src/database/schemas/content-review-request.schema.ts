import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import type { PostTag } from '@/forum/post-tag.constants';

export const CONTENT_REVIEW_TYPES = {
  POST: 'POST',
  CIRCLE: 'CIRCLE',
} as const;

export type ContentReviewType = (typeof CONTENT_REVIEW_TYPES)[keyof typeof CONTENT_REVIEW_TYPES];

export const CONTENT_REVIEW_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type ContentReviewStatus =
  (typeof CONTENT_REVIEW_STATUSES)[keyof typeof CONTENT_REVIEW_STATUSES];

export interface PostReviewPayload {
  title: string;
  content: string;
  circleId: string;
  tags: PostTag[];
}

export interface CircleReviewPayload {
  name: string;
  normalizedName: string;
  topic: string;
  creationWeekKey: string;
}

export type ContentReviewPayload = PostReviewPayload | CircleReviewPayload;
export type ContentReviewRequestDocument = HydratedDocument<ContentReviewRequest>;

@Schema({
  timestamps: true,
  collection: 'content_review_requests',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class ContentReviewRequest {
  id!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CONTENT_REVIEW_TYPES),
    immutable: true,
  })
  type!: ContentReviewType;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CONTENT_REVIEW_STATUSES),
    default: CONTENT_REVIEW_STATUSES.PENDING,
  })
  status!: ContentReviewStatus;

  @Prop({ type: String, required: true, immutable: true })
  requesterAgentId!: string;

  @Prop({ type: String, required: true, immutable: true, select: false })
  requesterOwnerUserIdSnapshot!: string;

  @Prop({ type: Object, required: true, immutable: true })
  payload!: ContentReviewPayload;

  @Prop({ type: String, default: null })
  activeKey!: string | null;

  @Prop({ type: String, default: null })
  pendingNameKey!: string | null;

  @Prop({ type: String, default: null })
  decisionReason!: string | null;

  @Prop({ type: String, default: null, select: false })
  decidedByUserId!: string | null;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ type: String, default: null })
  publishedTargetId!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ContentReviewRequestSchema = SchemaFactory.createForClass(ContentReviewRequest);

ContentReviewRequestSchema.index({ status: 1, createdAt: -1, _id: -1 });
ContentReviewRequestSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } },
);
ContentReviewRequestSchema.index(
  { pendingNameKey: 1 },
  { unique: true, partialFilterExpression: { pendingNameKey: { $type: 'string' } } },
);
