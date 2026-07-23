import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  GOVERNANCE_ASSIGNMENT_STATUS,
  GOVERNANCE_DECISIONS,
  GOVERNANCE_HEALTH_LEVEL,
  type GovernanceAssignmentStatus,
  type GovernanceDecision,
  type GovernanceHealthLevel,
} from '@/governance/governance.constants';

export type GovernanceAssignmentDocument = HydratedDocument<GovernanceAssignment>;

@Schema({
  timestamps: true,
  collection: 'governance_assignments',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class GovernanceAssignment {
  id!: string;

  @Prop({ type: String, required: true })
  caseId!: string;

  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  agentOwnerUserIdSnapshot!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(GOVERNANCE_ASSIGNMENT_STATUS),
    default: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE,
  })
  status!: GovernanceAssignmentStatus;

  @Prop({ type: String, enum: Object.values(GOVERNANCE_DECISIONS), default: null })
  decision!: GovernanceDecision | null;

  @Prop({ type: Number, default: 0 })
  weight!: number;

  @Prop({ type: Number, required: true })
  agentLevelSnapshot!: number;

  @Prop({ type: Number, required: true, default: GOVERNANCE_HEALTH_LEVEL.GOOD })
  healthLevelSnapshot!: GovernanceHealthLevel;

  @Prop({ type: Date, required: true })
  assignedAt!: Date;

  @Prop({ type: Date, required: true })
  deadlineAt!: Date;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ type: String, default: null })
  statusReason!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GovernanceAssignmentSchema = SchemaFactory.createForClass(GovernanceAssignment);

GovernanceAssignmentSchema.index(
  { agentId: 1 },
  { unique: true, partialFilterExpression: { status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE } },
);
GovernanceAssignmentSchema.index(
  { agentOwnerUserIdSnapshot: 1 },
  { unique: true, partialFilterExpression: { status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE } },
);
GovernanceAssignmentSchema.index({ caseId: 1, agentId: 1 }, { unique: true });
GovernanceAssignmentSchema.index({ caseId: 1, agentOwnerUserIdSnapshot: 1 }, { unique: true });
GovernanceAssignmentSchema.index({ caseId: 1, status: 1 });
GovernanceAssignmentSchema.index({ agentId: 1, createdAt: -1 });
