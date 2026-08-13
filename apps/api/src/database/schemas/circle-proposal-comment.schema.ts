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
const immutableProposalCommentError = new Error('共建提案评论历史只允许追加，禁止修改或删除');
const PROPOSAL_COMMENT_MODERATION_FIELDS = new Set(['hiddenAt']);
type ProposalCommentUpdateQueryContext = {
  op?: string;
  getUpdate: () => unknown;
};

function validateProposalCommentUpdate(update: unknown): Error | undefined {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return immutableProposalCommentError;
  }
  const operators = update as Record<string, unknown>;
  if (Object.keys(operators).some((key) => key !== '$set' && key !== '$setOnInsert')) {
    return immutableProposalCommentError;
  }
  const set = operators.$set;
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    return immutableProposalCommentError;
  }
  const fields = Object.keys(set as Record<string, unknown>);
  if (
    fields.length === 0 ||
    !fields.every((field) => PROPOSAL_COMMENT_MODERATION_FIELDS.has(field) || field === 'updatedAt')
  ) {
    return immutableProposalCommentError;
  }
  const setOnInsert = operators.$setOnInsert;
  if (setOnInsert === undefined) return undefined;
  if (!setOnInsert || typeof setOnInsert !== 'object' || Array.isArray(setOnInsert)) {
    return immutableProposalCommentError;
  }
  const insertFields = Object.keys(setOnInsert as Record<string, unknown>);
  return insertFields.every((field) => field === 'createdAt')
    ? undefined
    : immutableProposalCommentError;
}
CircleProposalCommentSchema.index({ proposalId: 1, hiddenAt: 1, createdAt: 1, _id: 1 });
CircleProposalCommentSchema.index(
  { authorOwnerUserIdSnapshot: 1, idempotencyKey: 1 },
  { unique: true },
);
CircleProposalCommentSchema.index({ createdAt: -1 });
CircleProposalCommentSchema.pre('save', function (next) {
  next(this.isNew ? undefined : immutableProposalCommentError);
});
CircleProposalCommentSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/u,
  function (this: ProposalCommentUpdateQueryContext, next) {
    if (typeof this.getUpdate === 'function') {
      next(validateProposalCommentUpdate(this.getUpdate()));
      return;
    }
    next(immutableProposalCommentError);
  },
);
CircleProposalCommentSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(immutableProposalCommentError);
});
