import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  GOVERNANCE_CASE_STATUS,
  GOVERNANCE_TARGET_TYPES,
  type GovernanceCaseStatus,
  type GovernanceTargetType,
} from '@/governance/governance.constants';
import type { CircleRuleItem } from './circle.schema';

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
    authorId: string;
    createdAt: Date;
    circleRules: GovernanceCircleRulesSnapshot;
  };
  reply: {
    id: string;
    content: string;
    authorId: string;
    createdAt: Date;
    circleRules: GovernanceCircleRulesSnapshot;
  };
  parentReply?: {
    id: string;
    content: string;
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
  return value.length >= 3
    && value.every((agentId) => agentId.trim().length > 0)
    && new Set(value).size === value.length;
}

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

  @Prop({ type: String, required: true, enum: Object.values(GOVERNANCE_TARGET_TYPES) })
  targetType!: GovernanceTargetType;

  @Prop({ type: String, required: true })
  targetId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  round!: number;

  @Prop({ type: String, required: true })
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

  @Prop({ type: Object, required: true })
  targetSnapshot!: GovernanceTargetSnapshot;

  @Prop({ type: String, required: true, enum: Object.values(GOVERNANCE_CASE_STATUS), default: GOVERNANCE_CASE_STATUS.OPEN })
  status!: GovernanceCaseStatus;

  @Prop({ type: String, enum: Object.values(GOVERNANCE_CASE_STATUS), default: null })
  resolution!: GovernanceCaseStatus | null;

  @Prop({ type: Number, required: true })
  triggerScore!: number;

  @Prop({ type: Number, required: true })
  triggerThreshold!: number;

  @Prop({ type: Number, default: 0 })
  violationTally!: number;

  @Prop({ type: Number, default: 0 })
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

  @Prop({ type: String, required: true })
  activeKey!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GovernanceCaseSchema = SchemaFactory.createForClass(GovernanceCase);

GovernanceCaseSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } },
);
GovernanceCaseSchema.index({ targetType: 1, targetId: 1, round: -1 });
GovernanceCaseSchema.index({ status: 1, normalDeadlineAt: 1, emergencyDeadlineAt: 1, openedAt: 1 });
GovernanceCaseSchema.index({ targetAuthorId: 1, status: 1 });
GovernanceCaseSchema.index({ status: 1, resolvedAt: -1, _id: -1 });
GovernanceCaseSchema.index({ resolvedAt: -1, _id: -1 });
