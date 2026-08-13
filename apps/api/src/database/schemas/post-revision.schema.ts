import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { POST_TAG_VALUES, type PostTag } from '@/forum/post-tag.constants';

export type PostRevisionDocument = HydratedDocument<PostRevision>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'post_revisions',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class PostRevision {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  postId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  version!: number;

  @Prop({ type: String, required: true, immutable: true })
  title!: string;

  @Prop({ type: String, required: true, immutable: true })
  content!: string;

  @Prop({ type: [String], required: true, enum: POST_TAG_VALUES, immutable: true })
  tags!: PostTag[];

  @Prop({ type: String, required: true, immutable: true })
  authorId!: string;

  @Prop({ type: Date, default: null })
  publicContentHiddenAt!: Date | null;

  @Prop({ type: String, default: null, maxlength: 280 })
  publicContentHideReason!: string | null;

  createdAt!: Date;
}

export const PostRevisionSchema = SchemaFactory.createForClass(PostRevision);

const immutablePostRevisionError = new Error('帖子修订历史只允许追加，禁止修改或删除');
const POST_REVISION_MODERATION_FIELDS = new Set([
  'publicContentHiddenAt',
  'publicContentHideReason',
]);
type RevisionUpdateQueryContext = {
  op?: string;
  getUpdate: () => unknown;
};

function validatePostRevisionUpdate(update: unknown): Error | undefined {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return immutablePostRevisionError;
  }
  const operators = update as Record<string, unknown>;
  if (Object.keys(operators).some((key) => key !== '$set' && key !== '$setOnInsert')) {
    return immutablePostRevisionError;
  }
  const set = operators.$set;
  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    return immutablePostRevisionError;
  }
  const fields = Object.keys(set as Record<string, unknown>);
  if (fields.length === 0 || !fields.every((field) => POST_REVISION_MODERATION_FIELDS.has(field))) {
    return immutablePostRevisionError;
  }
  const setOnInsert = operators.$setOnInsert;
  if (setOnInsert === undefined) return undefined;
  if (!setOnInsert || typeof setOnInsert !== 'object' || Array.isArray(setOnInsert)) {
    return immutablePostRevisionError;
  }
  const insertFields = Object.keys(setOnInsert as Record<string, unknown>);
  return insertFields.every((field) => field === 'createdAt') ? undefined : immutablePostRevisionError;
}

PostRevisionSchema.index(
  { postId: 1, version: 1 },
  { unique: true, name: 'uq_post_revisions_post_version' },
);
PostRevisionSchema.index({ postId: 1, version: -1 }, { name: 'ix_post_revisions_history' });
PostRevisionSchema.pre('save', function (next) {
  next(this.isNew ? undefined : immutablePostRevisionError);
});
PostRevisionSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (this: RevisionUpdateQueryContext, next) {
    if (typeof this.getUpdate === 'function') {
      const update = this.getUpdate();
      next(validatePostRevisionUpdate(update));
      return;
    }
    next(immutablePostRevisionError);
  },
);
PostRevisionSchema.pre('deleteOne', { document: true, query: false }, function (next) {
  next(immutablePostRevisionError);
});
