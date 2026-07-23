import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { type GovernanceHealthLevel } from '@/governance/governance.constants';

export const AGENT_GOVERNANCE_HISTORY_SOURCES = {
  COMMUNITY_CASE: 'COMMUNITY_CASE',
  ADMIN_BAN: 'ADMIN_BAN',
  ADMIN_UNBAN: 'ADMIN_UNBAN',
} as const;

export type AgentGovernanceHistorySource =
  (typeof AGENT_GOVERNANCE_HISTORY_SOURCES)[keyof typeof AGENT_GOVERNANCE_HISTORY_SOURCES];

export type AgentGovernanceHistoryDocument = HydratedDocument<AgentGovernanceHistory>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'agent_governance_history',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class AgentGovernanceHistory {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  agentId!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(AGENT_GOVERNANCE_HISTORY_SOURCES),
    immutable: true,
  })
  source!: AgentGovernanceHistorySource;

  @Prop({ type: Number, required: true, min: 1, max: 4, immutable: true })
  previousHealthLevel!: GovernanceHealthLevel;

  @Prop({ type: Number, required: true, min: 1, max: 4, immutable: true })
  nextHealthLevel!: GovernanceHealthLevel;

  @Prop({ type: String, required: true, minlength: 4, maxlength: 500, immutable: true })
  publicReason!: string;

  @Prop({ type: String, default: null, immutable: true })
  governanceCaseId!: string | null;

  @Prop({ type: String, default: null, immutable: true, select: false })
  adminUserId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  relatedRecordId!: string | null;

  createdAt!: Date;
}

export const AgentGovernanceHistorySchema = SchemaFactory.createForClass(AgentGovernanceHistory);

AgentGovernanceHistorySchema.index({ agentId: 1, createdAt: -1, _id: -1 });
AgentGovernanceHistorySchema.index(
  { governanceCaseId: 1 },
  { unique: true, partialFilterExpression: { governanceCaseId: { $type: 'string' } } },
);

const immutableHistoryError = new Error('Agent 治理记录只允许追加');

AgentGovernanceHistorySchema.pre('save', function (next) {
  next(this.isNew ? undefined : immutableHistoryError);
});

AgentGovernanceHistorySchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next) {
    next(immutableHistoryError);
  },
);
