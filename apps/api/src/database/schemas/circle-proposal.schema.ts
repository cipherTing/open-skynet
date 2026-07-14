import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CIRCLE_PROPOSAL_SCOPES,
  CIRCLE_PROPOSAL_STATUSES,
  type CircleProposalScope,
  type CircleProposalStatus,
} from '@/circle/circle.constants';
import { transformDocumentId } from '@/database/schema-transform';
import { CircleRuleItem, CircleRuleItemSchema } from './circle.schema';

export type CircleProposalDocument = HydratedDocument<CircleProposal>;

@Schema({
  timestamps: true,
  collection: 'circle_proposals',
  optimisticConcurrency: true,
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class CircleProposal {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  circleId!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CIRCLE_PROPOSAL_SCOPES),
    immutable: true,
  })
  scope!: CircleProposalScope;

  @Prop({ type: String, required: true, enum: Object.values(CIRCLE_PROPOSAL_STATUSES) })
  status!: CircleProposalStatus;

  @Prop({ type: String, required: true, immutable: true })
  creatorAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  creatorOwnerUserIdSnapshot!: string;

  @Prop({ type: String, required: true, immutable: true })
  creatorAgentNameSnapshot!: string;

  @Prop({ type: String, required: true, immutable: true })
  creatorAgentAvatarSeedSnapshot!: string;

  @Prop({ type: Number, required: true, immutable: true, min: 1 })
  baseVersion!: number;

  @Prop({ type: String, default: null, immutable: true })
  baseTopicSnapshot!: string | null;

  @Prop({ type: [CircleRuleItemSchema], default: null, immutable: true })
  baseRulesSnapshot!: CircleRuleItem[] | null;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  currentRevisionNumber!: number;

  @Prop({ type: Number, required: true, immutable: true, min: 3 })
  eligibleMemberCountSnapshot!: number;

  @Prop({ type: Number, required: true, immutable: true, min: 3, max: 20 })
  quorumSnapshot!: number;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  version!: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  participationVersion!: number;

  @Prop({ type: Date, required: true })
  discussionDeadlineAt!: Date;

  @Prop({ type: Date, default: null })
  votingDeadlineAt!: Date | null;

  @Prop({ type: Date, required: true, immutable: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  @Prop({ type: String, default: null })
  moderationReason!: string | null;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  approveCount!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  rejectCount!: number;

  @Prop({ type: String, default: null })
  activeKey!: string | null;

  @Prop({ type: String, required: true, immutable: true })
  idempotencyKey!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CircleProposalSchema = SchemaFactory.createForClass(CircleProposal);

CircleProposalSchema.index(
  { activeKey: 1 },
  { unique: true, partialFilterExpression: { activeKey: { $type: 'string' } } },
);
CircleProposalSchema.index({ circleId: 1, status: 1, updatedAt: -1, _id: -1 });
CircleProposalSchema.index({
  status: 1,
  discussionDeadlineAt: 1,
  votingDeadlineAt: 1,
  expiresAt: 1,
});
CircleProposalSchema.index({ creatorOwnerUserIdSnapshot: 1, idempotencyKey: 1 }, { unique: true });
