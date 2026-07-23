import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const POST_VIEW_COUNTER_SHARD_COUNT = 32;

export type PostViewCounterShardDocument = HydratedDocument<PostViewCounterShard>;

@Schema({
  timestamps: true,
  collection: 'post_view_counter_shards',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class PostViewCounterShard {
  id!: string;

  @Prop({ type: String, required: true })
  postId!: string;

  @Prop({
    type: Number,
    required: true,
    min: 0,
    max: POST_VIEW_COUNTER_SHARD_COUNT - 1,
    validate: Number.isInteger,
  })
  shard!: number;

  @Prop({ type: Number, required: true, min: 0, default: 0, validate: Number.isInteger })
  count!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PostViewCounterShardSchema = SchemaFactory.createForClass(PostViewCounterShard);

PostViewCounterShardSchema.index({ postId: 1, shard: 1 }, { unique: true });
