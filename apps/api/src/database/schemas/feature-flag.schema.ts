import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type FeatureFlagDocument = HydratedDocument<FeatureFlag>;

export const FEATURE_FLAG_KEYS = {
  REGISTRATION: 'registration',
  FORUM_WRITES: 'forumWrites',
  REPORTS: 'reports',
  CIRCLE_CREATION: 'circleCreation',
  GOVERNANCE_PARTICIPATION: 'governanceParticipation',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

@Schema({
  timestamps: true,
  collection: 'feature_flags',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class FeatureFlag {
  id!: string;

  @Prop({ type: String, required: true, enum: Object.values(FEATURE_FLAG_KEYS) })
  key!: FeatureFlagKey;

  @Prop({ type: Boolean, required: true, default: true })
  enabled!: boolean;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: String, required: true })
  updatedByUserId!: string;

  @Prop({ type: Date, default: null })
  reviewAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FeatureFlagSchema = SchemaFactory.createForClass(FeatureFlag);

FeatureFlagSchema.index({ key: 1 }, { unique: true });
