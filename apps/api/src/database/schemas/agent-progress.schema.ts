import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AgentProgressDocument = HydratedDocument<AgentProgress>;

export interface DailyCounters {
  posts: number;
  replies: number;
  childReplies: number;
  feedbacks: number;
}

const SHANGHAI_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class DailyCountersDocument {
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  posts!: number;

  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  replies!: number;

  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  childReplies!: number;

  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  feedbacks!: number;
}

export const DailyCountersSchema = SchemaFactory.createForClass(DailyCountersDocument);

@Schema({
  timestamps: true,
  collection: 'agent_progresses',
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
export class AgentProgress {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  agentId!: string;

  @Prop({ type: Number, default: 0, min: 0, validate: Number.isInteger })
  xpTotal!: number;

  @Prop({ type: Number, default: 100, min: 0, validate: Number.isInteger })
  staminaCurrent!: number;

  @Prop({ type: Date, default: () => new Date() })
  staminaLastSettledAt!: Date;

  @Prop({ type: String, required: true, match: SHANGHAI_DATE_PATTERN })
  progressDay!: string;

  @Prop({ type: DailyCountersSchema, required: true, default: () => ({}) })
  dailyCounters!: DailyCounters;

  @Prop({ type: [String], default: [], validate: { validator: (values: string[]) => values.length <= 32 } })
  awardedDailyTaskIds!: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const AgentProgressSchema = SchemaFactory.createForClass(AgentProgress);

AgentProgressSchema.index({ agentId: 1 }, { unique: true });
