import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  STORY_COLLABORATION_CASE_STATUSES,
  STORY_COLLABORATION_CASE_TYPES,
  STORY_COLLABORATION_MAX_EVIDENCE,
  STORY_COLLABORATION_MAX_RECUSED_IDENTITIES,
  STORY_EDIT_CONFLICT_REVISION_COUNT,
  STORY_COLLABORATION_MAX_VOTES,
  STORY_COLLABORATION_VOTE_DECISIONS,
  STORY_ENFORCEMENT_EVENT_ACTIONS,
  STORY_RESTRICTION_HOURS,
  type StoryCollaborationCaseStatus,
  type StoryCollaborationCaseType,
  type StoryCollaborationVoteDecision,
  type StoryEnforcementEventAction,
} from '@/story/story.constants';
import type { StoryCollaborationRestrictionHours } from '@/story/story-collaboration.constants';

export type { StoryEnforcementEventAction } from '@/story/story.constants';
export type { StoryCollaborationRestrictionHours } from '@/story/story-collaboration.constants';

export type StoryEditConflictDocument = HydratedDocument<StoryEditConflict>;
export type StoryCollaborationCaseDocument = HydratedDocument<StoryCollaborationCase>;
export type StoryCollaborationVoteDocument = HydratedDocument<StoryCollaborationVote>;
export type StoryEnforcementEventDocument = HydratedDocument<StoryEnforcementEvent>;

@Schema({ _id: false, strict: 'throw' })
export class StoryCollaborationIdentitySnapshot {
  @Prop({ type: String, required: true, immutable: true })
  agentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  ownerUserIdSnapshot!: string;
}

export const StoryCollaborationIdentitySnapshotSchema = SchemaFactory.createForClass(
  StoryCollaborationIdentitySnapshot,
);

@Schema({ _id: false, strict: 'throw' })
export class StoryCollaborationEvidenceReference {
  @Prop({ type: String, required: true, immutable: true })
  documentId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  revisionNumber!: number;

  @Prop({ type: String, required: true, immutable: true })
  authorAgentId!: string;

  @Prop({ type: String, required: true, immutable: true, select: false })
  authorOwnerUserIdSnapshot!: string;
}

export const StoryCollaborationEvidenceReferenceSchema = SchemaFactory.createForClass(
  StoryCollaborationEvidenceReference,
);

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_edit_conflicts',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
  toObject: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
})
export class StoryEditConflict {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: String, required: true, immutable: true })
  documentId!: string;

  @Prop({
    type: [Number],
    required: true,
    immutable: true,
    validate: {
      validator: (revisions: number[]) => revisions.length === 4,
      message: 'A story edit conflict must cite exactly four revisions',
    },
  })
  revisionNumbers!: number[];

  @Prop({
    type: [String],
    required: true,
    immutable: true,
    validate: {
      validator: (agentIds: string[]) => agentIds.length >= 2 && agentIds.length <= 4,
      message: 'A story edit conflict must cite two through four Agents',
    },
  })
  actorAgentIds!: string[];

  @Prop({
    type: [StoryCollaborationIdentitySnapshotSchema],
    required: true,
    immutable: true,
    select: false,
    validate: {
      validator: (identities: StoryCollaborationIdentitySnapshot[]) =>
        identities.length >= 2 && identities.length <= STORY_EDIT_CONFLICT_REVISION_COUNT,
      message: `A story edit conflict must preserve two through ${STORY_EDIT_CONFLICT_REVISION_COUNT} participant identities`,
    },
  })
  participantIdentitySnapshots!: StoryCollaborationIdentitySnapshot[];

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  triggeringRevisionNumber!: number;

  createdAt!: Date;
}

export const StoryEditConflictSchema = SchemaFactory.createForClass(StoryEditConflict);
StoryEditConflictSchema.index(
  { storyId: 1, documentId: 1, triggeringRevisionNumber: 1 },
  { unique: true, name: 'uq_story_edit_conflict_trigger' },
);
StoryEditConflictSchema.index(
  { storyId: 1, documentId: 1, revisionNumbers: 1 },
  { name: 'ix_story_conflict_evidence' },
);
StoryEditConflictSchema.index({ storyId: 1, createdAt: -1, _id: -1 });

@Schema({
  timestamps: true,
  collection: 'story_collaboration_cases',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
  toObject: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
})
export class StoryCollaborationCase {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(STORY_COLLABORATION_CASE_TYPES),
    immutable: true,
  })
  caseType!: StoryCollaborationCaseType;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(STORY_COLLABORATION_CASE_STATUSES),
    default: STORY_COLLABORATION_CASE_STATUSES.OPEN,
  })
  status!: StoryCollaborationCaseStatus;

  @Prop({ type: String, default: null, immutable: true })
  documentId!: string | null;

  @Prop({ type: Number, default: null, min: 1, immutable: true })
  revisionNumber!: number | null;

  @Prop({ type: String, default: null, immutable: true })
  targetAgentId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  noticeDiscussionId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  laterConflictId!: string | null;

  @Prop({ type: String, default: null, immutable: true, select: false })
  targetOwnerUserIdSnapshot!: string | null;

  @Prop({
    type: [StoryCollaborationEvidenceReferenceSchema],
    default: [],
    immutable: true,
    validate: {
      validator: (evidence: StoryCollaborationEvidenceReference[]) =>
        evidence.length <= STORY_COLLABORATION_MAX_EVIDENCE,
      message: `A collaboration case can cite at most ${STORY_COLLABORATION_MAX_EVIDENCE} revisions`,
    },
  })
  evidence!: StoryCollaborationEvidenceReference[];

  @Prop({
    type: [StoryCollaborationIdentitySnapshotSchema],
    default: [],
    immutable: true,
    select: false,
    validate: {
      validator: (identities: StoryCollaborationIdentitySnapshot[]) =>
        identities.length <= STORY_COLLABORATION_MAX_RECUSED_IDENTITIES,
      message: 'A collaboration case has too many recused identities',
    },
  })
  recusalIdentitySnapshots!: StoryCollaborationIdentitySnapshot[];

  @Prop({
    type: Number,
    default: null,
    enum: STORY_RESTRICTION_HOURS,
    immutable: true,
  })
  requestedRestrictionHours!: StoryCollaborationRestrictionHours | null;

  @Prop({ type: String, default: null, immutable: true })
  parentCaseId!: string | null;

  @Prop({ type: String, required: true, maxlength: 2_000, immutable: true })
  reason!: string;

  @Prop({ type: String, required: true, immutable: true })
  createdByAgentId!: string;

  @Prop({ type: String, required: true, immutable: true, select: false })
  createdByOwnerUserIdSnapshot!: string;

  @Prop({ type: Number, required: true, min: 0, max: STORY_COLLABORATION_MAX_VOTES, default: 0 })
  voteCount!: number;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  @Prop({ type: Date, default: null })
  restrictionExpiresAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const StoryCollaborationCaseSchema = SchemaFactory.createForClass(StoryCollaborationCase);
StoryCollaborationCaseSchema.index({ storyId: 1, createdAt: -1, _id: -1 });
StoryCollaborationCaseSchema.index(
  { storyId: 1, caseType: 1, documentId: 1, revisionNumber: 1 },
  {
    unique: true,
    name: 'uq_story_open_revision_review',
    partialFilterExpression: {
      caseType: STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW,
      status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
    },
  },
);
StoryCollaborationCaseSchema.index(
  { storyId: 1, laterConflictId: 1 },
  {
    unique: true,
    name: 'uq_story_restriction_conflict_signal',
    partialFilterExpression: { caseType: STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION },
  },
);
StoryCollaborationCaseSchema.index(
  { storyId: 1, targetAgentId: 1, documentId: 1 },
  {
    unique: true,
    name: 'uq_story_open_write_restriction_target',
    partialFilterExpression: {
      caseType: STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION,
      status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
    },
  },
);
StoryCollaborationCaseSchema.index(
  { storyId: 1, parentCaseId: 1 },
  {
    unique: true,
    name: 'uq_story_open_restriction_appeal',
    partialFilterExpression: {
      caseType: STORY_COLLABORATION_CASE_TYPES.RESTRICTION_APPEAL,
      status: STORY_COLLABORATION_CASE_STATUSES.OPEN,
    },
  },
);
StoryCollaborationCaseSchema.pre('validate', function (next) {
  const isRevisionReview =
    this.caseType === STORY_COLLABORATION_CASE_TYPES.REVISION_REVIEW &&
    this.documentId !== null &&
    this.revisionNumber !== null &&
    this.targetAgentId !== null &&
    this.evidence.length === 1 &&
    this.noticeDiscussionId === null &&
    this.laterConflictId === null &&
    this.parentCaseId === null &&
    this.requestedRestrictionHours === null;
  const isWriteRestriction =
    this.caseType === STORY_COLLABORATION_CASE_TYPES.WRITE_RESTRICTION &&
    this.documentId !== null &&
    this.revisionNumber === null &&
    this.targetAgentId !== null &&
    this.noticeDiscussionId !== null &&
    this.laterConflictId !== null &&
    this.evidence.length === STORY_EDIT_CONFLICT_REVISION_COUNT &&
    this.parentCaseId === null &&
    this.requestedRestrictionHours === 1;
  const isRestrictionAppeal =
    this.caseType === STORY_COLLABORATION_CASE_TYPES.RESTRICTION_APPEAL &&
    this.documentId !== null &&
    this.revisionNumber === null &&
    this.targetAgentId !== null &&
    this.evidence.length === 0 &&
    this.noticeDiscussionId === null &&
    this.laterConflictId === null &&
    this.parentCaseId !== null &&
    this.requestedRestrictionHours === null;
  next(
    isRevisionReview || isWriteRestriction || isRestrictionAppeal
      ? undefined
      : new Error('Invalid story collaboration case payload'),
  );
});

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_collaboration_votes',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
  toObject: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
})
export class StoryCollaborationVote {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: String, required: true, immutable: true })
  caseId!: string;

  @Prop({ type: String, required: true, immutable: true })
  reviewerAgentId!: string;

  @Prop({ type: String, required: true, immutable: true, select: false })
  reviewerOwnerUserIdSnapshot!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(STORY_COLLABORATION_VOTE_DECISIONS),
    immutable: true,
  })
  decision!: StoryCollaborationVoteDecision;

  @Prop({ type: String, required: true, maxlength: 2_000, immutable: true })
  reason!: string;

  createdAt!: Date;
}

export const StoryCollaborationVoteSchema = SchemaFactory.createForClass(StoryCollaborationVote);
StoryCollaborationVoteSchema.index(
  { caseId: 1, reviewerAgentId: 1 },
  { unique: true, name: 'uq_story_collaboration_vote_case_agent' },
);
StoryCollaborationVoteSchema.index(
  { caseId: 1, reviewerOwnerUserIdSnapshot: 1 },
  { unique: true, name: 'uq_story_collaboration_vote_case_owner' },
);
StoryCollaborationVoteSchema.index({ storyId: 1, caseId: 1, createdAt: 1, _id: 1 });

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'story_enforcement_events',
  strict: 'throw',
  versionKey: false,
  toJSON: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
  toObject: { virtuals: true, transform: stripStoryCollaborationIdentitySnapshots },
})
export class StoryEnforcementEvent {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  storyId!: string;

  @Prop({ type: String, required: true, immutable: true })
  targetAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  documentId!: string;

  @Prop({ type: String, required: true, immutable: true, select: false })
  targetOwnerUserIdSnapshot!: string;

  @Prop({ type: String, required: true, immutable: true })
  sourceCaseId!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(STORY_ENFORCEMENT_EVENT_ACTIONS),
    immutable: true,
  })
  action!: StoryEnforcementEventAction;

  @Prop({ type: Date, default: null, immutable: true })
  expiresAt!: Date | null;

  createdAt!: Date;
}

export const StoryEnforcementEventSchema = SchemaFactory.createForClass(StoryEnforcementEvent);
StoryEnforcementEventSchema.index(
  { storyId: 1, targetAgentId: 1, documentId: 1, createdAt: -1, _id: -1 },
  { name: 'ix_story_enforcement_target_history' },
);
StoryEnforcementEventSchema.index(
  { sourceCaseId: 1, action: 1 },
  { unique: true, name: 'uq_story_enforcement_case_action' },
);

function stripStoryCollaborationIdentitySnapshots(
  _document: object,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const transformed = { ...record };
  const id = transformed['_id'];
  if (id instanceof Types.ObjectId) transformed['id'] = id.toString();
  Reflect.deleteProperty(transformed, '_id');
  Reflect.deleteProperty(transformed, '__v');
  Reflect.deleteProperty(transformed, 'createdByOwnerUserIdSnapshot');
  Reflect.deleteProperty(transformed, 'targetOwnerUserIdSnapshot');
  Reflect.deleteProperty(transformed, 'reviewerOwnerUserIdSnapshot');
  Reflect.deleteProperty(transformed, 'authorOwnerUserIdSnapshot');
  const evidence = transformed['evidence'];
  if (Array.isArray(evidence)) {
    for (const reference of evidence) {
      if (reference !== null && typeof reference === 'object' && !Array.isArray(reference)) {
        Reflect.deleteProperty(reference, 'authorOwnerUserIdSnapshot');
      }
    }
  }
  for (const field of ['recusalIdentitySnapshots', 'participantIdentitySnapshots']) {
    const identities = transformed[field];
    if (Array.isArray(identities)) {
      Reflect.deleteProperty(transformed, field);
    }
  }
  return transformed;
}

const immutableStoryCollaborationRecordError = new Error(
  'Story collaboration conflict, vote, and enforcement records are append-only',
);

function enforceAppendOnly(schema: MongooseSchema): void {
  schema.pre('save', function (next) {
    next(this.isNew ? undefined : immutableStoryCollaborationRecordError);
  });
  schema.pre(
    /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
    function (next) {
      next(immutableStoryCollaborationRecordError);
    },
  );
  schema.pre('deleteOne', { document: true, query: false }, function (next) {
    next(immutableStoryCollaborationRecordError);
  });
}

enforceAppendOnly(StoryEditConflictSchema);
enforceAppendOnly(StoryCollaborationVoteSchema);
enforceAppendOnly(StoryEnforcementEventSchema);
