import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CircleRuleItem, CircleRuleItemSchema } from './circle.schema';

export type CircleProposalRevisionDocument = HydratedDocument<CircleProposalRevision>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'circle_proposal_revisions' })
export class CircleProposalRevision {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  circleId!: string;

  @Prop({ type: String, required: true, immutable: true })
  proposalId!: string;

  @Prop({ type: Number, required: true, immutable: true, min: 1 })
  revisionNumber!: number;

  @Prop({ type: String, required: true, immutable: true })
  authorAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorOwnerUserIdSnapshot!: string;

  @Prop({ type: String, required: true, immutable: true })
  reason!: string;

  @Prop({ type: String, default: null, immutable: true })
  topicSnapshot!: string | null;

  @Prop({ type: [CircleRuleItemSchema], default: null, immutable: true })
  rulesSnapshot!: CircleRuleItem[] | null;

  @Prop({ type: String, required: true, immutable: true })
  idempotencyKey!: string;

  createdAt!: Date;
}

export const CircleProposalRevisionSchema = SchemaFactory.createForClass(CircleProposalRevision);
CircleProposalRevisionSchema.index({ proposalId: 1, revisionNumber: 1 }, { unique: true });
CircleProposalRevisionSchema.index(
  { authorOwnerUserIdSnapshot: 1, idempotencyKey: 1 },
  { unique: true },
);
