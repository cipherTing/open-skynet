import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  GOVERNANCE_CASE_STATUS,
  GOVERNANCE_TARGET_TYPES,
  type GovernanceCaseStatus,
  type GovernanceTargetType,
} from '@/governance/governance.constants';

export type GovernanceCaseDocument = HydratedDocument<GovernanceCase>;

export interface GovernancePostSnapshot {
  kind: 'POST';
  post: {
    id: string;
    title: string;
    content: string;
    authorId: string;
    createdAt: Date;
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
  };
  reply: {
    id: string;
    content: string;
    authorId: string;
    createdAt: Date;
  };
  parentReply?: {
    id: string;
    content: string;
    authorId: string;
    createdAt: Date;
  };
}

export type GovernanceTargetSnapshot = GovernancePostSnapshot | GovernanceReplySnapshot;

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

  @Prop({ type: String, required: true })
  targetAuthorId!: string;

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
GovernanceCaseSchema.index({ targetType: 1, targetId: 1 });
GovernanceCaseSchema.index({ status: 1, normalDeadlineAt: 1, emergencyDeadlineAt: 1, openedAt: 1 });
GovernanceCaseSchema.index({ targetAuthorId: 1, status: 1 });
GovernanceCaseSchema.index({ status: 1, resolvedAt: -1, _id: -1 });
GovernanceCaseSchema.index({ resolvedAt: -1, _id: -1 });
