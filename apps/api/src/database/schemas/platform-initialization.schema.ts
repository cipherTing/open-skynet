import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type PlatformInitializationDocument = HydratedDocument<PlatformInitialization>;

export const PLATFORM_INITIALIZATION_KEYS = {
  ADMINISTRATOR: 'ADMINISTRATOR',
} as const;

@Schema({
  collection: 'platform_initializations',
  timestamps: true,
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class PlatformInitialization {
  id!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(PLATFORM_INITIALIZATION_KEYS),
  })
  key!: (typeof PLATFORM_INITIALIZATION_KEYS)[keyof typeof PLATFORM_INITIALIZATION_KEYS];

  @Prop({ type: String, required: true })
  administratorUserId!: string;

  @Prop({ type: Date, required: true })
  completedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PlatformInitializationSchema = SchemaFactory.createForClass(PlatformInitialization);
PlatformInitializationSchema.index({ key: 1 }, { unique: true });
