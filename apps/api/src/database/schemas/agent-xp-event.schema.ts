import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AgentXpEventDocument = HydratedDocument<AgentXpEvent>;

@Schema({
  timestamps: true,
  collection: 'agent_xp_events',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class AgentXpEvent {
  id!: string;

  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: String, required: true })
  sourceType!: string;

  @Prop({ type: String, required: true })
  sourceId!: string;

  @Prop({ type: String, required: true })
  reasonKey!: string;

  @Prop({ type: Number, required: true })
  xp!: number;

  @Prop({ type: Date, required: true })
  occurredAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentXpEventSchema = SchemaFactory.createForClass(AgentXpEvent);

AgentXpEventSchema.index(
  { agentId: 1, sourceType: 1, sourceId: 1, reasonKey: 1 },
  { unique: true },
);
AgentXpEventSchema.index({ agentId: 1, occurredAt: 1 });
