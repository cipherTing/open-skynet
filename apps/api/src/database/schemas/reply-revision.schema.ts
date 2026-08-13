import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type ReplyRevisionDocument = HydratedDocument<ReplyRevision>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'reply_revisions',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class ReplyRevision {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  replyId!: string;

  @Prop({ type: String, required: true, immutable: true })
  postId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  version!: number;

  @Prop({ type: String, required: true, immutable: true })
  content!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorId!: string;

  @Prop({ type: Date, default: null })
  publicContentHiddenAt!: Date | null;

  @Prop({ type: String, default: null, maxlength: 280 })
  publicContentHideReason!: string | null;

  createdAt!: Date;
}

export const ReplyRevisionSchema = SchemaFactory.createForClass(ReplyRevision);

const immutableReplyRevisionError = new Error('回复修订历史只允许追加，禁止修改或删除');
const REPLY_REVISION_MODERATION_FIELDS = new Set([
  'publicContentHiddenAt',
  'publicContentHideReason',
]);
type RevisionUpdateQueryContext = {
  op?: string;
  getUpdate: () => unknown;
};

function validateReplyRevisionUpdate(update: unknown): Error | undefined {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return immutableReplyRevisionError;
  }
  const operators = update as Record<string, unknown>;
  if (Object.keys(operators).some((key) => key !== '$set' && key !== '$setOnInsert')) {
    return immutableReplyRevisionError;
  }
  const set = operators.$set;
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    return immutableReplyRevisionError;
  }
  const fields = Object.keys(set as Record<string, unknown>);
  if (fields.length === 0 || !fields.every((field) => REPLY_REVISION_MODERATION_FIELDS.has(field))) {
    return immutableReplyRevisionError;
  }
  const setOnInsert = operators.$setOnInsert;
  if (setOnInsert === undefined) return undefined;
  if (!setOnInsert || typeof setOnInsert !== 'object' || Array.isArray(setOnInsert)) {
    return immutableReplyRevisionError;
  }
  const insertFields = Object.keys(setOnInsert as Record<string, unknown>);
  return insertFields.every((field) => field === 'createdAt') ? undefined : immutableReplyRevisionError;
}

ReplyRevisionSchema.index(
  { replyId: 1, version: 1 },
  { unique: true, name: 'uq_reply_revisions_reply_version' },
);
ReplyRevisionSchema.index({ replyId: 1, version: -1 }, { name: 'ix_reply_revisions_history' });
ReplyRevisionSchema.pre('save', function (next) {
  next(this.isNew ? undefined : immutableReplyRevisionError);
});
ReplyRevisionSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (this: RevisionUpdateQueryContext, next) {
    if (typeof this.getUpdate === 'function') {
      next(validateReplyRevisionUpdate(this.getUpdate()));
      return;
    }
    next(immutableReplyRevisionError);
  },
);
ReplyRevisionSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(immutableReplyRevisionError);
});
