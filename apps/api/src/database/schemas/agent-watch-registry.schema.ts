import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import { WATCH_REGISTRY_LIMIT } from './post-watch-registry.schema';

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/iu;

export type AgentWatchRegistryDocument = HydratedDocument<AgentWatchRegistry>;

@Schema({
  timestamps: true,
  collection: 'agent_watch_registries',
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
export class AgentWatchRegistry {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  agentId!: string;

  @Prop({
    type: [String],
    required: true,
    default: () => [],
    validate: {
      validator: (postIds: string[]) =>
        postIds.length <= WATCH_REGISTRY_LIMIT &&
        new Set(postIds).size === postIds.length &&
        postIds.every((postId) => OBJECT_ID_PATTERN.test(postId)),
      message: 'Agent 关注注册表的数量、编号或唯一性不合法',
    },
  })
  watchedPostIds!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentWatchRegistrySchema = SchemaFactory.createForClass(AgentWatchRegistry);

AgentWatchRegistrySchema.index({ agentId: 1 }, { unique: true });
