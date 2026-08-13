import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  GOVERNANCE_CASE_STATUS,
  GOVERNANCE_MAX_TALLY,
  GOVERNANCE_TARGET_TYPES,
  type GovernanceCaseStatus,
  type GovernanceTargetType,
} from '@/governance/governance.constants';
import { CircleRuleItem, CircleRuleItemSchema } from './circle.schema';
import { POST_TAG_VALUES, type PostTag } from '@/forum/post-tag.constants';

export type GovernanceCaseDocument = HydratedDocument<GovernanceCase>;

export interface GovernanceCircleRulesSnapshot {
  circleId: string;
  version: number;
  rules: CircleRuleItem[];
}

export interface GovernancePostSnapshot {
  kind: 'POST';
  post: {
    id: string;
    title: string;
    content: string;
    tags: PostTag[];
    contentVersion: number;
    authorId: string;
    createdAt: Date;
    circleRules: GovernanceCircleRulesSnapshot;
  };
}

export interface GovernanceReplySnapshot {
  kind: 'REPLY';
  post: {
    id: string;
    title: string;
    content: string;
    tags: PostTag[];
    contentVersion: number;
    authorId: string;
    createdAt: Date;
    circleRules: GovernanceCircleRulesSnapshot;
  };
  reply: {
    id: string;
    content: string;
    contentVersion: number;
    authorId: string;
    createdAt: Date;
    circleRules: GovernanceCircleRulesSnapshot;
  };
  parentReply?: {
    id: string;
    content: string;
    contentVersion: number;
    authorId: string;
    createdAt: Date;
    circleRules: GovernanceCircleRulesSnapshot;
  };
}

export interface GovernanceCircleProposalSnapshot {
  kind: 'CIRCLE_PROPOSAL';
  proposal: {
    id: string;
    circleId: string;
    scope: 'TOPIC' | 'RULES';
    revisionNumber: number;
    reason: string;
    topicSnapshot: string | null;
    rulesSnapshot: CircleRuleItem[] | null;
    authorId: string;
    createdAt: Date;
  };
}

export interface GovernanceCircleProposalCommentSnapshot {
  kind: 'CIRCLE_PROPOSAL_COMMENT';
  proposal: { id: string; circleId: string };
  comment: {
    id: string;
    revisionNumber: number;
    content: string;
    authorId: string;
    createdAt: Date;
  };
}

export type GovernanceTargetSnapshot =
  | GovernancePostSnapshot
  | GovernanceReplySnapshot
  | GovernanceCircleProposalSnapshot
  | GovernanceCircleProposalCommentSnapshot;

function hasAtLeastThreeUniqueNonEmptyValues(value: string[]): boolean {
  return (
    value.length >= 3 &&
    value.every((agentId) => agentId.trim().length > 0) &&
    new Set(value).size === value.length
  );
}

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceCircleRulesSnapshotDocument {
  @Prop({ type: String, required: true })
  circleId!: string;

  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger })
  version!: number;

  @Prop({ type: [CircleRuleItemSchema], required: true, maxlength: 20 })
  rules!: CircleRuleItem[];
}

const GovernanceCircleRulesSnapshotSchema = SchemaFactory.createForClass(
  GovernanceCircleRulesSnapshotDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw', discriminatorKey: 'kind' })
export class GovernanceTargetSnapshotBase {
  @Prop({ type: String, required: true, enum: Object.values(GOVERNANCE_TARGET_TYPES) })
  kind!: GovernanceTargetType;
}

const GovernanceTargetSnapshotBaseSchema = SchemaFactory.createForClass(
  GovernanceTargetSnapshotBase,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernancePostSnapshotDocument {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: [String], required: true, enum: POST_TAG_VALUES, maxlength: 3 })
  tags!: PostTag[];

  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger })
  contentVersion!: number;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: GovernanceCircleRulesSnapshotSchema, required: true })
  circleRules!: GovernanceCircleRulesSnapshot;
}

const GovernancePostSnapshotSchema = SchemaFactory.createForClass(
  GovernancePostSnapshotDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceReplySnapshotDocument {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger })
  contentVersion!: number;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: Date, required: true })
  createdAt!: Date;

  @Prop({ type: GovernanceCircleRulesSnapshotSchema, required: true })
  circleRules!: GovernanceCircleRulesSnapshot;
}

const GovernanceReplySnapshotSchema = SchemaFactory.createForClass(
  GovernanceReplySnapshotDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernancePostTargetSnapshotDocument {
  @Prop({ type: GovernancePostSnapshotSchema, required: true })
  post!: GovernancePostSnapshot;
}

const GovernancePostTargetSnapshotSchema = SchemaFactory.createForClass(
  GovernancePostTargetSnapshotDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceReplyTargetSnapshotDocument {
  @Prop({ type: GovernancePostSnapshotSchema, required: true })
  post!: GovernancePostSnapshot;

  @Prop({ type: GovernanceReplySnapshotSchema, required: true })
  reply!: GovernanceReplySnapshot;

  @Prop({ type: GovernanceReplySnapshotSchema, default: undefined })
  parentReply?: GovernanceReplySnapshot;
}

const GovernanceReplyTargetSnapshotSchema = SchemaFactory.createForClass(
  GovernanceReplyTargetSnapshotDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceCircleProposalValueDocument {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  circleId!: string;

  @Prop({ type: String, required: true, enum: ['TOPIC', 'RULES'] })
  scope!: 'TOPIC' | 'RULES';

  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger })
  revisionNumber!: number;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: String, default: null })
  topicSnapshot!: string | null;

  @Prop({ type: [CircleRuleItemSchema], default: null, maxlength: 20 })
  rulesSnapshot!: CircleRuleItem[] | null;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

const GovernanceCircleProposalValueSchema = SchemaFactory.createForClass(
  GovernanceCircleProposalValueDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceCircleProposalTargetSnapshotDocument {
  @Prop({ type: GovernanceCircleProposalValueSchema, required: true })
  proposal!: GovernanceCircleProposalSnapshot['proposal'];
}

const GovernanceCircleProposalTargetSnapshotSchema = SchemaFactory.createForClass(
  GovernanceCircleProposalTargetSnapshotDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceCircleProposalCommentValueDocument {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  circleId!: string;

  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger })
  revisionNumber!: number;

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: String, required: true })
  authorId!: string;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

const GovernanceCircleProposalCommentValueSchema = SchemaFactory.createForClass(
  GovernanceCircleProposalCommentValueDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceCircleProposalCommentTargetReferenceDocument {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  circleId!: string;
}

const GovernanceCircleProposalCommentTargetReferenceSchema = SchemaFactory.createForClass(
  GovernanceCircleProposalCommentTargetReferenceDocument,
);

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class GovernanceCircleProposalCommentTargetDocument {
  @Prop({ type: GovernanceCircleProposalCommentTargetReferenceSchema, required: true })
  proposal!: GovernanceCircleProposalCommentSnapshot['proposal'];

  @Prop({ type: GovernanceCircleProposalCommentValueSchema, required: true })
  comment!: GovernanceCircleProposalCommentSnapshot['comment'];
}

const GovernanceCircleProposalCommentTargetSchema = SchemaFactory.createForClass(
  GovernanceCircleProposalCommentTargetDocument,
);

@Schema({
  timestamps: true,
  collection: 'governance_cases',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class GovernanceCase {
  id!: string;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: Object.values(GOVERNANCE_TARGET_TYPES),
  })
  targetType!: GovernanceTargetType;

  @Prop({ type: String, required: true, immutable: true })
  targetId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  targetContentVersion!: number;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  round!: number;

  @Prop({ type: String, required: true, immutable: true })
  targetAuthorId!: string;

  @Prop({
    type: [String],
    required: true,
    immutable: true,
    select: false,
    validate: {
      validator: hasAtLeastThreeUniqueNonEmptyValues,
      message: 'reporterAgentIds must contain at least three unique Agent IDs',
    },
  })
  reporterAgentIds!: string[];

  @Prop({
    type: [String],
    required: true,
    immutable: true,
    select: false,
    validate: {
      validator: hasAtLeastThreeUniqueNonEmptyValues,
      message: 'reporterOwnerUserIds must contain at least three unique owner IDs',
    },
  })
  reporterOwnerUserIds!: string[];

  @Prop({ type: String, required: true, immutable: true, select: false })
  targetAuthorOwnerUserId!: string;

  @Prop({ type: GovernanceTargetSnapshotBaseSchema, required: true, immutable: true })
  targetSnapshot!: GovernanceTargetSnapshot;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(GOVERNANCE_CASE_STATUS),
    default: GOVERNANCE_CASE_STATUS.OPEN,
  })
  status!: GovernanceCaseStatus;

  @Prop({ type: String, enum: Object.values(GOVERNANCE_CASE_STATUS), default: null })
  resolution!: GovernanceCaseStatus | null;

  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger })
  triggerScore!: number;

  @Prop({ type: Number, required: true, min: 1, validate: Number.isInteger })
  triggerThreshold!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
    max: GOVERNANCE_MAX_TALLY,
    validate: { validator: (value: number) => Number.isInteger(value * 2) },
  })
  violationTally!: number;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
    max: GOVERNANCE_MAX_TALLY,
    validate: { validator: (value: number) => Number.isInteger(value * 2) },
  })
  notViolationTally!: number;

  @Prop({ type: Date, required: true })
  openedAt!: Date;

  @Prop({ type: Date, required: true })
  firstReviewAt!: Date;

  @Prop({ type: Date, required: true })
  normalDeadlineAt!: Date;

  @Prop({ type: Date, default: null })
  firstReviewedAt!: Date | null;

  @Prop({ type: Date, required: true })
  emergencyDeadlineAt!: Date;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  @Prop({ type: String, required: true, enum: ['COMMUNITY', 'ADMIN'], default: 'COMMUNITY' })
  resolutionSource!: 'COMMUNITY' | 'ADMIN';

  @Prop({ type: String, default: null })
  resolutionReason!: string | null;

  @Prop({ type: String, default: null, select: false })
  resolvedByUserId!: string | null;

  @Prop({ type: Date, default: null })
  lastDispatchedAt!: Date | null;

  @Prop({ type: Date, default: null })
  nextTransitionAt!: Date | null;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  deadlineVersion!: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  deadlinePublishedVersion!: number;

  @Prop({ type: Date, default: null })
  deadlineScheduleDispatchAt!: Date | null;

  @Prop({ type: Number, min: 1, default: null, select: false })
  deadlineScheduleClaimVersion!: number | null;

  @Prop({ type: String, default: null, select: false })
  deadlineScheduleClaimToken!: string | null;

  @Prop({ type: Date, default: null, select: false })
  deadlineScheduleClaimExpiresAt!: Date | null;

  @Prop({ type: String, default: null, select: false })
  deadlineScheduleDeliveryToken!: string | null;

  @Prop({ type: Date, default: null })
  deadlineCompensationDispatchAt!: Date | null;

  @Prop({ type: String, default: null, select: false })
  deadlineCompensationClaimToken!: string | null;

  @Prop({ type: Date, default: null, select: false })
  deadlineCompensationClaimExpiresAt!: Date | null;

  @Prop({ type: String, default: null, select: false })
  deadlineCompensationDeliveryToken!: string | null;

  @Prop({ type: Number, min: 0, default: 0, select: false })
  deadlineRecoveryFailureCount!: number;

  @Prop({ type: Date, default: null, select: false })
  deadlineRecoveryLastFailureAt!: Date | null;

  @Prop({ type: Date, default: null, select: false })
  deadlineRecoveryNextAttemptAt!: Date | null;

  @Prop({ type: String, default: null, select: false })
  deadlineRecoveryReasonClass!: string | null;

  @Prop({ type: String, default: null, select: false })
  deadlineRecoveryReasonFingerprint!: string | null;

  @Prop({ type: Number, min: 1, default: null, select: false })
  deadlineClaimVersion!: number | null;

  @Prop({ type: String, default: null, select: false })
  deadlineClaimToken!: string | null;

  @Prop({ type: Date, default: null, select: false })
  deadlineClaimExpiresAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GovernanceCaseSchema = SchemaFactory.createForClass(GovernanceCase);

const snapshotPath = GovernanceCaseSchema.path('targetSnapshot') as {
  discriminator?: (name: string, schema: unknown) => unknown;
};
if (typeof snapshotPath.discriminator !== 'function') {
  throw new Error('治理 targetSnapshot 必须使用单嵌套 discriminator');
}
snapshotPath.discriminator(GOVERNANCE_TARGET_TYPES.POST, GovernancePostTargetSnapshotSchema);
snapshotPath.discriminator(GOVERNANCE_TARGET_TYPES.REPLY, GovernanceReplyTargetSnapshotSchema);
snapshotPath.discriminator(
  GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL,
  GovernanceCircleProposalTargetSnapshotSchema,
);
snapshotPath.discriminator(
  GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL_COMMENT,
  GovernanceCircleProposalCommentTargetSchema,
);

GovernanceCaseSchema.pre('validate', function (next) {
  next(
    this.targetSnapshot?.kind === this.targetType
      ? undefined
      : new Error('治理 targetSnapshot 与 targetType 不匹配'),
  );
});

GovernanceCaseSchema.index(
  { targetType: 1, targetId: 1, targetContentVersion: 1, round: 1 },
  { unique: true, name: 'uq_governance_cases_target_round' },
);
GovernanceCaseSchema.index({ targetType: 1, targetId: 1, targetContentVersion: 1, round: -1 });
GovernanceCaseSchema.index({
  status: 1,
  emergencyDeadlineAt: 1,
  normalDeadlineAt: 1,
  openedAt: 1,
  _id: 1,
});
GovernanceCaseSchema.index({ targetAuthorId: 1, status: 1 });
GovernanceCaseSchema.index({ status: 1, resolvedAt: -1, _id: -1 });
GovernanceCaseSchema.index({ resolvedAt: -1, _id: -1 });
GovernanceCaseSchema.index({ status: 1, nextTransitionAt: 1, _id: 1 });
GovernanceCaseSchema.index({ status: 1, deadlineScheduleDispatchAt: 1, _id: 1 });
GovernanceCaseSchema.index({ status: 1, deadlineCompensationDispatchAt: 1, _id: 1 });
