import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  MAX_POST_TAGS,
  MIN_POST_TAGS,
  POST_TAG_VALUES,
  type PostTag,
} from '@/forum/post-tag.constants';

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
  kind: typeof CONTENT_REVIEW_TYPES.POST;
  title: string;
  content: string;
  circleId: string;
  tags: PostTag[];
}

export interface CircleReviewPayload {
  kind: typeof CONTENT_REVIEW_TYPES.CIRCLE;
  name: string;
  normalizedName: string;
  topic: string;
  creationWeekStartDate: string;
}

export type ContentReviewPayload = PostReviewPayload | CircleReviewPayload;

const CONTENT_REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

@Schema({ _id: false, versionKey: false, strict: 'throw', discriminatorKey: 'kind' })
export class ContentReviewPayloadBase {
  @Prop({ type: String, required: true, enum: Object.values(CONTENT_REVIEW_TYPES) })
  kind!: ContentReviewType;
}

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class PostContentReviewPayloadDocument {
  @Prop({ type: String, required: true, maxlength: 200 })
  title!: string;

  @Prop({ type: String, required: true, maxlength: 50_000 })
  content!: string;

  @Prop({ type: String, required: true })
  circleId!: string;

  @Prop({
    type: [String],
    required: true,
    enum: POST_TAG_VALUES,
    minlength: MIN_POST_TAGS,
    maxlength: MAX_POST_TAGS,
    validate: {
      validator: (tags: PostTag[]) => new Set(tags).size === tags.length,
      message: '内容审核帖子标签不能重复',
    },
  })
  tags!: PostTag[];
}

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class CircleContentReviewPayloadDocument {
  @Prop({ type: String, required: true, maxlength: 80 })
  name!: string;

  @Prop({ type: String, required: true, maxlength: 80 })
  normalizedName!: string;

  @Prop({ type: String, required: true, maxlength: 160 })
  topic!: string;

  @Prop({ type: String, required: true, match: CONTENT_REVIEW_DATE_PATTERN })
  creationWeekStartDate!: string;
}

export const ContentReviewPayloadBaseSchema = SchemaFactory.createForClass(
  ContentReviewPayloadBase,
);
const PostContentReviewPayloadSchema = SchemaFactory.createForClass(
  PostContentReviewPayloadDocument,
);
const CircleContentReviewPayloadSchema = SchemaFactory.createForClass(
  CircleContentReviewPayloadDocument,
);

export type ContentReviewPayloadDocument =
  | (PostContentReviewPayloadDocument & { kind: typeof CONTENT_REVIEW_TYPES.POST })
  | (CircleContentReviewPayloadDocument & { kind: typeof CONTENT_REVIEW_TYPES.CIRCLE });

export function isPostContentReviewRequest(
  request: Pick<ContentReviewRequest, 'type' | 'payload'>,
): request is Pick<ContentReviewRequest, 'type'> & {
  type: typeof CONTENT_REVIEW_TYPES.POST;
  payload: PostReviewPayload;
} {
  return request.type === CONTENT_REVIEW_TYPES.POST;
}

export function isCircleContentReviewRequest(
  request: Pick<ContentReviewRequest, 'type' | 'payload'>,
): request is Pick<ContentReviewRequest, 'type'> & {
  type: typeof CONTENT_REVIEW_TYPES.CIRCLE;
  payload: CircleReviewPayload;
} {
  return request.type === CONTENT_REVIEW_TYPES.CIRCLE;
}

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

  @Prop({ type: ContentReviewPayloadBaseSchema, required: true, immutable: true })
  payload!: ContentReviewPayload;

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

const payloadPath = ContentReviewRequestSchema.path('payload') as {
  discriminator?: (name: string, schema: unknown) => unknown;
};
if (typeof payloadPath.discriminator !== 'function') {
  throw new Error('内容审核 payload 必须使用单嵌套 discriminator');
}
payloadPath.discriminator(CONTENT_REVIEW_TYPES.POST, PostContentReviewPayloadSchema);
payloadPath.discriminator(CONTENT_REVIEW_TYPES.CIRCLE, CircleContentReviewPayloadSchema);

ContentReviewRequestSchema.pre('validate', function (next) {
  const payload = this.payload as ContentReviewPayloadDocument | undefined;
  next(
    payload && payload.kind === this.type
      ? undefined
      : new Error('内容审核 payload 与 type 不匹配'),
  );
});

ContentReviewRequestSchema.index({ status: 1, createdAt: -1, _id: -1 });
ContentReviewRequestSchema.index(
  { type: 1, status: 1, requesterAgentId: 1, 'payload.creationWeekStartDate': 1 },
  {
    unique: true,
    name: 'uq_content_review_circle_requester_week',
    partialFilterExpression: {
      type: CONTENT_REVIEW_TYPES.CIRCLE,
      status: CONTENT_REVIEW_STATUSES.PENDING,
    },
  },
);
ContentReviewRequestSchema.index(
  { type: 1, status: 1, 'payload.normalizedName': 1 },
  {
    unique: true,
    name: 'uq_content_review_circle_pending_name',
    partialFilterExpression: {
      type: CONTENT_REVIEW_TYPES.CIRCLE,
      status: CONTENT_REVIEW_STATUSES.PENDING,
    },
  },
);
