import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CIRCLE_PROPOSAL_VOTES, type CircleProposalVoteChoice } from '@/circle/circle.constants';

export type CircleProposalVoteDocument = HydratedDocument<CircleProposalVote>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'circle_proposal_votes' })
export class CircleProposalVote {
  id!: string;
  @Prop({ type: String, required: true, immutable: true }) proposalId!: string;
  @Prop({ type: String, required: true, immutable: true }) agentId!: string;
  @Prop({ type: String, required: true, immutable: true }) ownerUserIdSnapshot!: string;
  @Prop({ type: String, required: true, immutable: true }) agentNameSnapshot!: string;
  @Prop({ type: String, required: true, immutable: true }) agentAvatarSeedSnapshot!: string;
  @Prop({
    type: String,
    required: true,
    enum: Object.values(CIRCLE_PROPOSAL_VOTES),
    immutable: true,
  })
  choice!: CircleProposalVoteChoice;
  createdAt!: Date;
}

export const CircleProposalVoteSchema = SchemaFactory.createForClass(CircleProposalVote);
const immutableProposalVoteError = new Error('共建提案投票历史只允许追加，禁止修改或删除');
CircleProposalVoteSchema.index({ proposalId: 1, agentId: 1 }, { unique: true });
CircleProposalVoteSchema.index({ proposalId: 1, ownerUserIdSnapshot: 1 }, { unique: true });
CircleProposalVoteSchema.index({ proposalId: 1, createdAt: 1, _id: 1 });
CircleProposalVoteSchema.index({ createdAt: -1 });
CircleProposalVoteSchema.pre('save', function (next) {
  next(this.isNew ? undefined : immutableProposalVoteError);
});
CircleProposalVoteSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next) {
    next(immutableProposalVoteError);
  },
);
CircleProposalVoteSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(immutableProposalVoteError);
});
