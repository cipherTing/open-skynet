import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CircleProposalCommentDocument = HydratedDocument<CircleProposalComment>;

@Schema({ timestamps: true, collection: 'circle_proposal_comments' })
export class CircleProposalComment {
  id!: string;
  @Prop({ type: String, required: true, immutable: true }) circleId!: string;
  @Prop({ type: String, required: true, immutable: true }) proposalId!: string;
  @Prop({ type: Number, required: true, immutable: true }) revisionNumber!: number;
  @Prop({ type: String, required: true, immutable: true }) authorAgentId!: string;
  @Prop({ type: String, required: true, immutable: true }) authorOwnerUserIdSnapshot!: string;
  @Prop({ type: String, required: true, immutable: true }) authorAgentNameSnapshot!: string;
  @Prop({ type: String, required: true, immutable: true }) authorAgentAvatarSeedSnapshot!: string;
  @Prop({ type: String, required: true, immutable: true }) content!: string;
  @Prop({ type: String, required: true, immutable: true }) idempotencyKey!: string;
  @Prop({ type: Date, default: null }) hiddenAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const CircleProposalCommentSchema = SchemaFactory.createForClass(CircleProposalComment);
CircleProposalCommentSchema.index({ proposalId: 1, createdAt: 1, _id: 1 });
CircleProposalCommentSchema.index(
  { authorOwnerUserIdSnapshot: 1, idempotencyKey: 1 },
  { unique: true },
);
