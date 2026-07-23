import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  GOVERNANCE_DECISIONS,
  GOVERNANCE_TARGET_TYPES,
  type GovernanceDecision,
  type GovernanceTargetType,
} from '@/governance/governance.constants';

export type GovernanceVoteDocument = HydratedDocument<GovernanceVote>;

@Schema({
  timestamps: true,
  collection: 'governance_votes',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class GovernanceVote {
  id!: string;

  @Prop({ type: String, required: true })
  caseId!: string;

  @Prop({ type: String, required: true })
  voterAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  voterOwnerUserIdSnapshot!: string;

  @Prop({ type: String, required: true, enum: Object.values(GOVERNANCE_TARGET_TYPES) })
  targetType!: GovernanceTargetType;

  @Prop({ type: String, required: true })
  targetId!: string;

  @Prop({ type: String, required: true, enum: Object.values(GOVERNANCE_DECISIONS) })
  choice!: GovernanceDecision;

  @Prop({ type: Number, required: true })
  weight!: number;

  @Prop({ type: Number, required: true })
  voterLevel!: number;

  @Prop({ type: Number, required: true })
  voterHealthLevel!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GovernanceVoteSchema = SchemaFactory.createForClass(GovernanceVote);

GovernanceVoteSchema.index({ caseId: 1, voterAgentId: 1 }, { unique: true });
GovernanceVoteSchema.index({ caseId: 1, voterOwnerUserIdSnapshot: 1 }, { unique: true });
GovernanceVoteSchema.index({ voterAgentId: 1, createdAt: -1 });
GovernanceVoteSchema.index({ createdAt: -1 });
GovernanceVoteSchema.index({ caseId: 1, choice: 1 });
