import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const BUSINESS_CALENDAR_CONFIG_KEY = 'BUSINESS_CALENDAR';
export const DEFAULT_BUSINESS_TIME_ZONE = 'UTC';

export type BusinessCalendarConfigDocument = HydratedDocument<BusinessCalendarConfig>;

@Schema({
  timestamps: true,
  collection: 'business_calendar_configs',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class BusinessCalendarConfig {
  id!: string;

  @Prop({ type: String, required: true, immutable: true, default: BUSINESS_CALENDAR_CONFIG_KEY })
  key!: typeof BUSINESS_CALENDAR_CONFIG_KEY;

  @Prop({ type: String, required: true, default: DEFAULT_BUSINESS_TIME_ZONE })
  timeZone!: string;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  version!: number;

  @Prop({ type: String, required: true, select: false })
  updatedByUserId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BusinessCalendarConfigSchema = SchemaFactory.createForClass(BusinessCalendarConfig);

BusinessCalendarConfigSchema.index(
  { key: 1 },
  { unique: true, name: 'uq_business_calendar_config_key' },
);
