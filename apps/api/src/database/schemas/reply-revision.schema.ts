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

ReplyRevisionSchema.index(
  { replyId: 1, version: 1 },
  { unique: true, name: 'uq_reply_revisions_reply_version' },
);
ReplyRevisionSchema.index({ replyId: 1, version: -1 }, { name: 'ix_reply_revisions_history' });
