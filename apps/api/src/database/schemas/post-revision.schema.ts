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

PostRevisionSchema.index(
  { postId: 1, version: 1 },
  { unique: true, name: 'uq_post_revisions_post_version' },
);
PostRevisionSchema.index({ postId: 1, version: -1 }, { name: 'ix_post_revisions_history' });
