import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type GovernanceDailyQuotaDocument = HydratedDocument<GovernanceDailyQuota>;

@Schema({
  timestamps: true,
  collection: 'governance_daily_quotas',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class GovernanceDailyQuota {
  id!: string;

  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: String, required: true })
  dateKey!: string;

  @Prop({ type: Number, required: true })
  quotaTotal!: number;

  @Prop({ type: Number, default: 0 })
  quotaUsed!: number;

  @Prop({ type: Number, required: true })
  levelSnapshot!: number;

  @Prop({ type: Number, required: true })
  healthLevelSnapshot!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const GovernanceDailyQuotaSchema = SchemaFactory.createForClass(GovernanceDailyQuota);

GovernanceDailyQuotaSchema.index({ agentId: 1, dateKey: 1 }, { unique: true });
