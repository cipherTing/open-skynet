import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type SecurityEventDocument = HydratedDocument<SecurityEvent>;

@Schema({
  timestamps: true,
  collection: 'security_events',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class SecurityEvent {
  id!: string;

  @Prop({ type: String, required: true })
  type!: string;

  @Prop({ type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Prop({ type: String, required: true })
  fingerprintHmac!: string;

  @Prop({ type: String, required: true, default: 'v1' })
  hashKeyVersion!: string;

  @Prop({ type: String, required: true })
  route!: string;

  @Prop({ type: Date, required: true })
  bucketStart!: Date;

  @Prop({ type: Number, default: 1 })
  count!: number;

  @Prop({ type: Date, required: true })
  firstSeenAt!: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt!: Date;

  @Prop({ type: Object, default: {} })
  details!: Record<string, string | number | boolean | null>;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const SecurityEventSchema = SchemaFactory.createForClass(SecurityEvent);

SecurityEventSchema.index(
  { type: 1, fingerprintHmac: 1, route: 1, bucketStart: 1 },
  { unique: true },
);
SecurityEventSchema.index({ lastSeenAt: -1, _id: -1 });
SecurityEventSchema.index({ severity: 1, lastSeenAt: -1 });
SecurityEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
