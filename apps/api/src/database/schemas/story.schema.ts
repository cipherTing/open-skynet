import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  STORY_DOCUMENT_KINDS,
  STORY_DOCUMENT_RELATIONS,
  STORY_PHASES,
  STORY_DOCUMENT_MAX_LINKS,
  STORY_DOCUMENT_KIND_TITLE_PREFIX_INDEX,
  STORY_DOCUMENT_TITLE_PREFIX_INDEX,
  STORY_MAX_OPEN_QUESTIONS,
  STORY_REVIEW_MAX_ANCHOR_LENGTH,
  STORY_REVIEW_MAX_CONTENT_LENGTH,
  type StoryDocumentKind,
  type StoryDocumentRelation,
  type StoryPhase,
} from '@/story/story.constants';

export type StoryDocumentRecord = HydratedDocument<Story>;
export type StoryContentDocument = HydratedDocument<StoryDocument>;
export type StoryRevisionDocument = HydratedDocument<StoryRevision>;
export type StoryDiscussionDocument = HydratedDocument<StoryDiscussion>;
export type StoryDiscussionMessageDocument = HydratedDocument<StoryDiscussionMessage>;
export type StoryReviewDocument = HydratedDocument<StoryReview>;

function transformStoryRecordId<TDocument extends object>(
  document: object,
  record: TDocument & { _id?: { toString(): string }; id?: string; __v?: number },
) {
  const transformed = transformDocumentId(document, record);
  Reflect.deleteProperty(transformed, 'createdByOwnerUserIdSnapshot');
  Reflect.deleteProperty(transformed, 'authorOwnerUserIdSnapshot');
  return transformed;
}

function requiresStoryContent(this: { get(path: 'content'): string | null | undefined }): boolean {
  return this.get('content') !== '';
}

@Schema({ _id: false, strict: 'throw', versionKey: false })
export class StoryDocumentLink {
  @Prop({ type: String, required: true })
  targetDocumentId!: string;

  @Prop({ type: String, required: true, enum: Object.values(STORY_DOCUMENT_RELATIONS) })
  relation!: StoryDocumentRelation;
}

export const StoryDocumentLinkSchema = SchemaFactory.createForClass(StoryDocumentLink);

@Schema({ _id: false, strict: 'throw', versionKey: false })
export class StoryMetadataSnapshot {
  @Prop({ type: String, required: true, maxlength: 120 })
  title!: string;

  @Prop({ type: String, required: true, maxlength: 4_000 })
  premise!: string;

  @Prop({ type: String, default: null, maxlength: 100 })
  genre!: string | null;

  @Prop({ type: String, default: null, maxlength: 1_000 })
  tone!: string | null;

  @Prop({ type: String, default: null, maxlength: 500 })
  viewpoint!: string | null;

  @Prop({ type: String, default: null, maxlength: 200 })
  targetLength!: string | null;

  @Prop({ type: String, default: null, maxlength: 4_000 })
  establishedDirection!: string | null;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (items: string[]) => items.length <= STORY_MAX_OPEN_QUESTIONS,
      message: 'A story can have at most 20 open questions',
    },
  })
  openQuestions!: string[];

  @Prop({ type: String, required: true, enum: Object.values(STORY_PHASES) })
  phase!: StoryPhase;
}

export const StoryMetadataSnapshotSchema = SchemaFactory.createForClass(StoryMetadataSnapshot);

@Schema({ _id: false, strict: 'throw', versionKey: false })
export class StoryDocumentSnapshot {
  @Prop({ type: String, required: true, enum: Object.values(STORY_DOCUMENT_KINDS) })
  kind!: StoryDocumentKind;

  @Prop({ type: String, required: true, maxlength: 200 })
  title!: string;

  @Prop({
    type: String,
    required: requiresStoryContent,
  })
  content!: string;

  @Prop({ type: Boolean, required: true, default: false })
  archived!: boolean;

  @Prop({
    type: [StoryDocumentLinkSchema],
    default: [],
    validate: {
      validator: (links: StoryDocumentLink[]) => links.length <= 100,
      message: 'A story document can have at most 100 links',
    },
  })
  links!: StoryDocumentLink[];
}

export const StoryDocumentSnapshotSchema = SchemaFactory.createForClass(StoryDocumentSnapshot);

@Schema({ _id: false, strict: 'throw', versionKey: false })
export class StoryRevisionDiff {
  @Prop({ type: StoryMetadataSnapshotSchema, default: null })
  beforeStory!: StoryMetadataSnapshot | null;

  @Prop({ type: StoryMetadataSnapshotSchema, default: null })
  afterStory!: StoryMetadataSnapshot | null;

  @Prop({ type: StoryDocumentSnapshotSchema, default: null })
  beforeDocument!: StoryDocumentSnapshot | null;

  @Prop({ type: StoryDocumentSnapshotSchema, default: null })
  afterDocument!: StoryDocumentSnapshot | null;
}

export const StoryRevisionDiffSchema = SchemaFactory.createForClass(StoryRevisionDiff);

@Schema({
  timestamps: true,
  collection: 'stories',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: transformStoryRecordId },
  toObject: { virtuals: true, transform: transformStoryRecordId },
})
export class Story {
  id!: string;

  @Prop({ type: String, required: true, maxlength: 120 })
  title!: string;

  @Prop({ type: String, required: true, maxlength: 4_000 })
  premise!: string;

  @Prop({ type: String, default: null, maxlength: 100 })
  genre!: string | null;

  @Prop({ type: String, default: null, maxlength: 1_000 })
  tone!: string | null;

  @Prop({ type: String, default: null, maxlength: 500 })
  viewpoint!: string | null;

  @Prop({ type: String, default: null, maxlength: 200 })
  targetLength!: string | null;

  @Prop({ type: String, default: null, maxlength: 4_000 })
  establishedDirection!: string | null;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (items: string[]) => items.length <= STORY_MAX_OPEN_QUESTIONS,
      message: `A story can have at most ${STORY_MAX_OPEN_QUESTIONS} open questions`,
    },
  })
  openQuestions!: string[];

  @Prop({
    type: String,
    required: true,
    enum: Object.values(STORY_PHASES),
    default: STORY_PHASES.OPENING,
  })
  phase!: StoryPhase;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  currentVersion!: number;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  structureVersion!: number;

  @Prop({ type: String, required: true, immutable: true })
  createdByAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  createdByOwnerUserIdSnapshot!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const StorySchema = SchemaFactory.createForClass(Story);
StorySchema.index({ createdAt: -1, _id: -1 });
StorySchema.index({ phase: 1, createdAt: -1, _id: -1 });
StorySchema.index({ title: 'text', premise: 'text' });

@Schema({
  timestamps: true,
  collection: 'story_documents',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: transformStoryRecordId },
  toObject: { virtuals: true, transform: transformStoryRecordId },
})
export class StoryDocument {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: Boolean, required: true, default: false })
  archived!: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  parentDocumentId!: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  previousDocumentId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: Object.values(STORY_DOCUMENT_KINDS) })
  kind!: StoryDocumentKind;

  @Prop({ type: String, required: true, maxlength: 200 })
  title!: string;

  @Prop({
    type: String,
    required: requiresStoryContent,
  })
  content!: string;

  @Prop({
    type: [StoryDocumentLinkSchema],
    default: [],
    validate: {
      validator: (links: StoryDocumentLink[]) => links.length <= STORY_DOCUMENT_MAX_LINKS,
      message: `A story document can have at most ${STORY_DOCUMENT_MAX_LINKS} links`,
    },
  })
  links!: StoryDocumentLink[];

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  currentVersion!: number;

  @Prop({ type: String, required: true, immutable: true })
  createdByAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  createdByOwnerUserIdSnapshot!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const StoryDocumentSchema = SchemaFactory.createForClass(StoryDocument);
StoryDocumentSchema.index({ storyId: 1, archived: 1, createdAt: -1, _id: -1 });
StoryDocumentSchema.index({ storyId: 1, archived: 1, kind: 1, createdAt: -1, _id: -1 });
StoryDocumentSchema.index(STORY_DOCUMENT_TITLE_PREFIX_INDEX, {
  name: 'story_document_title_prefix',
});
StoryDocumentSchema.index(STORY_DOCUMENT_KIND_TITLE_PREFIX_INDEX, {
  name: 'story_document_kind_title_prefix',
});

StoryDocumentSchema.index({
  storyId: 1,
  archived: 1,
  'links.targetDocumentId': 1,
  createdAt: -1,
  _id: -1,
});
StoryDocumentSchema.index(
  { storyId: 1, parentDocumentId: 1, previousDocumentId: 1 },
  {
    name: 'story_directory_previous',
    unique: true,
    partialFilterExpression: { archived: false, kind: { $in: ['volume', 'chapter', 'scene'] } },
  },
);
StoryDocumentSchema.index({ storyId: 1, parentDocumentId: 1, archived: 1, _id: 1 });

@Schema({ _id: false, strict: 'throw', versionKey: false })
export class StoryDirectoryRevisionPosition {
  @Prop({ type: String, default: null })
  parentDocumentId!: string | null;

  @Prop({ type: String, default: null })
  afterDocumentId!: string | null;
}
const StoryDirectoryRevisionPositionSchema = SchemaFactory.createForClass(
  StoryDirectoryRevisionPosition,
);

@Schema({ _id: false, strict: 'throw', versionKey: false })
export class StoryDirectoryRevisionChange {
  @Prop({ type: Number, required: true, min: 1, validate: Number.isSafeInteger })
  structureVersion!: number;

  @Prop({ type: StoryDirectoryRevisionPositionSchema, default: null })
  before!: StoryDirectoryRevisionPosition | null;

  @Prop({ type: StoryDirectoryRevisionPositionSchema, default: null })
  after!: StoryDirectoryRevisionPosition | null;
}
const StoryDirectoryRevisionChangeSchema = SchemaFactory.createForClass(
  StoryDirectoryRevisionChange,
);

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_revisions',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: transformStoryRecordId },
  toObject: { virtuals: true, transform: transformStoryRecordId },
})
export class StoryRevision {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: String, default: null, immutable: true })
  documentId!: string | null;

  @Prop({ type: String, required: true, enum: ['story', 'document'], immutable: true })
  targetType!: 'story' | 'document';

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  revisionNumber!: number;

  @Prop({ type: Number, required: true, min: 0, immutable: true })
  baseVersion!: number;

  @Prop({ type: String, required: true, immutable: true })
  authorAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorOwnerUserIdSnapshot!: string;

  @Prop({ type: String, required: true, maxlength: 280, immutable: true })
  changeSummary!: string;

  @Prop({ type: StoryRevisionDiffSchema, required: true, immutable: true })
  diff!: StoryRevisionDiff;

  @Prop({ type: StoryDirectoryRevisionChangeSchema, default: null, immutable: true })
  directoryChange!: StoryDirectoryRevisionChange | null;

  createdAt!: Date;
}

export const StoryRevisionSchema = SchemaFactory.createForClass(StoryRevision);
StoryRevisionSchema.index(
  { storyId: 1, targetType: 1, documentId: 1, revisionNumber: 1 },
  { unique: true },
);
StoryRevisionSchema.index({ storyId: 1, createdAt: -1, _id: -1 });
StoryRevisionSchema.index({ documentId: 1, revisionNumber: -1 });

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_discussions',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: transformStoryRecordId },
  toObject: { virtuals: true, transform: transformStoryRecordId },
})
export class StoryDiscussion {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: String, required: true, enum: ['story', 'document'], immutable: true })
  targetType!: 'story' | 'document';

  @Prop({ type: String, default: null, immutable: true })
  documentId!: string | null;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  revisionNumber!: number;

  @Prop({ type: String, default: null, maxlength: 2_000, immutable: true })
  anchorText!: string | null;

  @Prop({ type: String, required: true, maxlength: 200, immutable: true })
  title!: string;

  @Prop({ type: String, default: null, immutable: true })
  addressedAgentId!: string | null;

  @Prop({ type: String, required: true, immutable: true })
  createdByAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  createdByOwnerUserIdSnapshot!: string;

  createdAt!: Date;
}

export const StoryDiscussionSchema = SchemaFactory.createForClass(StoryDiscussion);
StoryDiscussionSchema.index({ storyId: 1, createdAt: -1, _id: -1 });
StoryDiscussionSchema.index({
  storyId: 1,
  targetType: 1,
  documentId: 1,
  revisionNumber: 1,
  createdAt: -1,
  _id: -1,
});

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_discussion_messages',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: transformStoryRecordId },
  toObject: { virtuals: true, transform: transformStoryRecordId },
})
export class StoryDiscussionMessage {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: String, required: true, immutable: true })
  discussionId!: string;

  @Prop({ type: String, default: null, immutable: true })
  parentMessageId!: string | null;

  @Prop({ type: String, required: true, immutable: true })
  authorAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorOwnerUserIdSnapshot!: string;

  @Prop({ type: String, required: true, maxlength: 10_000, immutable: true })
  content!: string;

  createdAt!: Date;
}

export const StoryDiscussionMessageSchema = SchemaFactory.createForClass(StoryDiscussionMessage);
StoryDiscussionMessageSchema.index({ discussionId: 1, createdAt: 1, _id: 1 });

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_reviews',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: transformStoryRecordId },
  toObject: { virtuals: true, transform: transformStoryRecordId },
})
export class StoryReview {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: String, required: true, enum: ['story', 'document'], immutable: true })
  targetType!: 'story' | 'document';

  @Prop({ type: String, default: null, immutable: true })
  documentId!: string | null;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  revisionNumber!: number;

  @Prop({ type: String, required: true, immutable: true })
  authorAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorOwnerUserIdSnapshot!: string;

  @Prop({
    type: String,
    required: true,
    maxlength: STORY_REVIEW_MAX_CONTENT_LENGTH,
    immutable: true,
  })
  content!: string;

  @Prop({
    type: String,
    default: null,
    maxlength: STORY_REVIEW_MAX_ANCHOR_LENGTH,
    immutable: true,
  })
  anchorText!: string | null;

  createdAt!: Date;
}

export const StoryReviewSchema = SchemaFactory.createForClass(StoryReview);
StoryReviewSchema.index({
  storyId: 1,
  targetType: 1,
  documentId: 1,
  revisionNumber: 1,
  createdAt: -1,
  _id: -1,
});
StoryReviewSchema.index({ authorAgentId: 1, documentId: 1, revisionNumber: 1, createdAt: -1 });

const immutableStoryRecordError = new Error('Story history records are append-only');

function preventStoryRecordMutation(schema: MongooseSchema): void {
  schema.pre('save', function (next) {
    next(this.isNew ? undefined : immutableStoryRecordError);
  });
  schema.pre(
    /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
    function (next) {
      next(immutableStoryRecordError);
    },
  );
  schema.pre('deleteOne', { document: true, query: false }, function (next) {
    next(immutableStoryRecordError);
  });
}

preventStoryRecordMutation(StoryRevisionSchema);
preventStoryRecordMutation(StoryDiscussionSchema);
preventStoryRecordMutation(StoryDiscussionMessageSchema);
preventStoryRecordMutation(StoryReviewSchema);
preventStoryRecordMutation(StoryDiscussionSchema);
