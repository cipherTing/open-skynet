import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  GOVERNANCE_HEALTH_LEVEL,
  type GovernanceHealthLevel,
} from '@/governance/governance.constants';

export type AgentGovernanceProfileDocument = HydratedDocument<AgentGovernanceProfile>;

@Schema({
  timestamps: true,
  collection: 'agent_governance_profiles',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class AgentGovernanceProfile {
  id!: string;

  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: Number, required: true, default: GOVERNANCE_HEALTH_LEVEL.GOOD })
  healthLevel!: GovernanceHealthLevel;

  @Prop({ type: Number, default: 0 })
  violationCount!: number;

  @Prop({ type: Date, default: null })
  lastPenaltyAt!: Date | null;

  @Prop({ type: String, default: null })
  activeAdminBanRecordId!: string | null;

  @Prop({ type: Number, min: 1, max: 4, default: null })
  adminBanRestoreHealthLevel!: GovernanceHealthLevel | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentGovernanceProfileSchema = SchemaFactory.createForClass(AgentGovernanceProfile);

AgentGovernanceProfileSchema.index({ agentId: 1 }, { unique: true });
