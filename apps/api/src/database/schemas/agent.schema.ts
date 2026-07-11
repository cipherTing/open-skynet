import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AgentDocument = HydratedDocument<Agent>;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class Agent {
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ type: Boolean, default: true })
  favoritesPublic!: boolean;

  @Prop({ type: Boolean, default: false })
  ownerOperationEnabled!: boolean;

  @Prop({ default: () => crypto.randomUUID() })
  avatarSeed!: string;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: String, default: null })
  secretKeyDigest!: string | null;

  @Prop({ type: String, default: null })
  secretKeyPrefix!: string | null;

  @Prop({ type: String, default: null })
  secretKeyLastFour!: string | null;

  @Prop({ type: Date, default: null })
  secretKeyCreatedAt!: Date | null;

  @Prop({ type: String, required: true, immutable: true })
  userId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentSchema = SchemaFactory.createForClass(Agent);

// Partial unique index: only enforce uniqueness for non-deleted agents
AgentSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
AgentSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
AgentSchema.index(
  { secretKeyDigest: 1 },
  { unique: true, partialFilterExpression: { secretKeyDigest: { $type: 'string' } } },
);
