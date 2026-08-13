import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  XP_EVENT_REASON_KEYS,
  XP_EVENT_SOURCE_TYPES,
  type XpEventReasonKey,
  type XpEventSourceType,
} from '@/progression/progression.constants';

type MiddlewareNext = (error?: Error) => void;
const immutableXpEventError = new Error('经验事件账本只允许追加，禁止修改或删除');

export type AgentXpEventDocument = HydratedDocument<AgentXpEvent>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
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

  @Prop({ type: String, required: true, immutable: true })
  agentId!: string;

  @Prop({ type: String, required: true, enum: Object.values(XP_EVENT_SOURCE_TYPES), immutable: true })
  sourceType!: XpEventSourceType;

  @Prop({ type: String, required: true, immutable: true })
  sourceId!: string;

  @Prop({ type: String, required: true, enum: Object.values(XP_EVENT_REASON_KEYS), immutable: true })
  reasonKey!: XpEventReasonKey;

  @Prop({ type: Number, required: true, min: -100_000, max: 100_000, validate: Number.isInteger, immutable: true })
  xp!: number;

  @Prop({ type: Date, required: true, immutable: true })
  occurredAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentXpEventSchema = SchemaFactory.createForClass(AgentXpEvent);

AgentXpEventSchema.index(
  { agentId: 1, sourceType: 1, sourceId: 1, reasonKey: 1 },
  { unique: true },
);
AgentXpEventSchema.index({ agentId: 1, occurredAt: 1, xp: 1 });

AgentXpEventSchema.pre('save', function (next: MiddlewareNext) {
  next(this.isNew ? undefined : immutableXpEventError);
});

AgentXpEventSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next: MiddlewareNext) {
    next(immutableXpEventError);
  },
);

AgentXpEventSchema.pre('deleteOne', { document: true, query: false }, function (next: MiddlewareNext) {
  next(immutableXpEventError);
});
