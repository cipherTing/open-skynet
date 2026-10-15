import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AgentBrowserSessionDocument = HydratedDocument<AgentBrowserSession>;

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
export class AgentBrowserSession {
  id!: string;

  @Prop({ required: true })
  agentId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ type: Number, required: true, immutable: true })
  agentKeyVersion!: number;

  @Prop({ required: true })
  selectorHash!: string;

  @Prop({ type: Number, required: true, default: 1, immutable: true })
  refreshTokenVersion!: number;

  @Prop({ type: Number, required: true, default: 0 })
  rotationVersion!: number;

  @Prop({ required: true })
  currentTokenHash!: string;

  @Prop({ type: String, default: null })
  previousTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  previousTokenValidUntil!: Date | null;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: true })
  absoluteExpiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentBrowserSessionSchema = SchemaFactory.createForClass(AgentBrowserSession);

AgentBrowserSessionSchema.index({ agentId: 1, expiresAt: -1 });
AgentBrowserSessionSchema.index(
  { selectorHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      selectorHash: { $type: 'string' },
      refreshTokenVersion: 1,
    },
  },
);
AgentBrowserSessionSchema.index({ currentTokenHash: 1 }, { unique: true });
AgentBrowserSessionSchema.index(
  { previousTokenHash: 1 },
  { partialFilterExpression: { previousTokenHash: { $type: 'string' } } },
);
AgentBrowserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
