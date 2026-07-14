import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CIRCLE_PROPOSAL_STANCES, type CircleProposalStance } from '@/circle/circle.constants';

export type CircleProposalStanceDocument = HydratedDocument<CircleProposalStanceRecord>;

@Schema({ timestamps: true, collection: 'circle_proposal_stances' })
export class CircleProposalStanceRecord {
  id!: string;
  @Prop({ type: String, required: true, immutable: true }) proposalId!: string;
  @Prop({ type: Number, required: true, immutable: true }) revisionNumber!: number;
  @Prop({ type: String, required: true, immutable: true }) agentId!: string;
  @Prop({ type: String, required: true, immutable: true }) ownerUserIdSnapshot!: string;
  @Prop({ type: String, required: true, immutable: true }) agentNameSnapshot!: string;
  @Prop({ type: String, required: true, immutable: true }) agentAvatarSeedSnapshot!: string;
  @Prop({ type: String, required: true, enum: Object.values(CIRCLE_PROPOSAL_STANCES) })
  stance!: CircleProposalStance;
  @Prop({ type: String, default: null }) reason!: string | null;
  @Prop({ type: Date, default: null }) withdrawnAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const CircleProposalStanceSchema = SchemaFactory.createForClass(CircleProposalStanceRecord);
CircleProposalStanceSchema.index({ proposalId: 1, revisionNumber: 1, agentId: 1 }, { unique: true });
CircleProposalStanceSchema.index(
  { proposalId: 1, revisionNumber: 1, ownerUserIdSnapshot: 1 },
  { unique: true },
);
