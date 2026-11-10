import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const STORY_ACTIVITY_KINDS = {
  STORY_CREATED: 'STORY_CREATED',
  STORY_REVISED: 'STORY_REVISED',
  DOCUMENT_CREATED: 'DOCUMENT_CREATED',
  DOCUMENT_REVISED: 'DOCUMENT_REVISED',
  DOCUMENT_MOVED: 'DOCUMENT_MOVED',
  DOCUMENT_WITHDRAWN: 'DOCUMENT_WITHDRAWN',
  DOCUMENT_REINSTATED: 'DOCUMENT_REINSTATED',
  DISCUSSION_CREATED: 'DISCUSSION_CREATED',
  MESSAGE_CREATED: 'MESSAGE_CREATED',
  REVIEW_CREATED: 'REVIEW_CREATED',
  CASE_CREATED: 'CASE_CREATED',
  CASE_RESOLVED: 'CASE_RESOLVED',
  APPEAL_CREATED: 'APPEAL_CREATED',
} as const;
export type StoryActivityKind = (typeof STORY_ACTIVITY_KINDS)[keyof typeof STORY_ACTIVITY_KINDS];

const safeInteger = (value: number): boolean => Number.isSafeInteger(value);

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_activities',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: transformDocumentId },
})
export class StoryActivity {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    immutable: true,
    validate: safeInteger,
  })
  sequence!: number;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(STORY_ACTIVITY_KINDS),
    immutable: true,
  })
  kind!: StoryActivityKind;

  @Prop({ type: String, required: true, enum: ['story', 'document'], immutable: true })
  targetType!: 'story' | 'document';

  @Prop({ type: String, default: null, immutable: true })
  documentId!: string | null;

  @Prop({
    type: Number,
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    default: null,
    immutable: true,
    validate: (value: number | null) => value === null || safeInteger(value),
  })
  revisionNumber!: number | null;

  @Prop({ type: String, default: null, immutable: true })
  discussionId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  messageId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  caseId!: string | null;

  @Prop({ type: String, required: true, immutable: true })
  authorAgentId!: string;

  @Prop({ type: String, required: true, maxlength: 200, immutable: true })
  title!: string;

  @Prop({ type: String, required: true, maxlength: 1000, immutable: true })
  summary!: string;

  createdAt!: Date;
}
export const StoryActivitySchema = SchemaFactory.createForClass(StoryActivity);
StoryActivitySchema.index(
  { storyId: 1, sequence: 1 },
  { unique: true, name: 'uq_story_activity_sequence' },
);

@Schema({ collection: 'story_activity_counters', strict: 'throw', versionKey: false })
export class StoryActivityCounter {
  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({
    type: Number,
    required: true,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    default: 0,
    validate: safeInteger,
  })
  sequence!: number;
}
export const StoryActivityCounterSchema = SchemaFactory.createForClass(StoryActivityCounter);
StoryActivityCounterSchema.index(
  { storyId: 1 },
  { unique: true, name: 'uq_story_activity_counter' },
);
