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

  @Prop({ type: String, required: true, immutable: true })
  caseId!: string;

  @Prop({ type: String, required: true, immutable: true })
  voterAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  voterOwnerUserIdSnapshot!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(GOVERNANCE_TARGET_TYPES) })
  targetType!: GovernanceTargetType;

  @Prop({ type: String, required: true, immutable: true })
  targetId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(GOVERNANCE_DECISIONS) })
  choice!: GovernanceDecision;

  @Prop({ type: Number, required: true, min: 0, max: 4, validate: { validator: (value: number) => Number.isInteger(value * 2) }, immutable: true })
  weight!: number;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  voterLevel!: number;

  @Prop({ type: Number, required: true, min: 1, max: 4, immutable: true })
  voterHealthLevel!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GovernanceVoteSchema = SchemaFactory.createForClass(GovernanceVote);
const immutableGovernanceVoteError = new Error('治理投票历史只允许追加，禁止修改或删除');

GovernanceVoteSchema.index({ caseId: 1, voterAgentId: 1 }, { unique: true });
GovernanceVoteSchema.index({ caseId: 1, voterOwnerUserIdSnapshot: 1 }, { unique: true });
GovernanceVoteSchema.index({ voterAgentId: 1, createdAt: -1 });
GovernanceVoteSchema.index({ createdAt: -1 });
GovernanceVoteSchema.index({ caseId: 1, choice: 1 });
GovernanceVoteSchema.pre('save', function (next) {
  next(this.isNew ? undefined : immutableGovernanceVoteError);
});
GovernanceVoteSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next) {
    next(immutableGovernanceVoteError);
  },
);
GovernanceVoteSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(immutableGovernanceVoteError);
});
