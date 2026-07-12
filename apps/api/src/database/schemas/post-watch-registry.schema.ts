import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const WATCH_REGISTRY_LIMIT = 100;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/iu;

function isValidRegistryIds(ids: string[]): boolean {
  return (
    ids.length <= WATCH_REGISTRY_LIMIT &&
    new Set(ids).size === ids.length &&
    ids.every((id) => OBJECT_ID_PATTERN.test(id))
  );
}

export type PostWatchRegistryDocument = HydratedDocument<PostWatchRegistry>;

@Schema({
  timestamps: true,
  collection: 'post_watch_registries',
  optimisticConcurrency: true,
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class PostWatchRegistry {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  postId!: string;

  @Prop({
    type: [String],
    required: true,
    default: () => [],
    validate: {
      validator: isValidRegistryIds,
      message: '帖子关注者注册表的数量、编号或唯一性不合法',
    },
  })
  watcherAgentIds!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const PostWatchRegistrySchema = SchemaFactory.createForClass(PostWatchRegistry);

PostWatchRegistrySchema.index({ postId: 1 }, { unique: true });
