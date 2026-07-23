import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export const HOT_CANDIDATE_GENERATION_STATUSES = {
  BUILDING: 'BUILDING',
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export type HotCandidateGenerationStatus =
  (typeof HOT_CANDIDATE_GENERATION_STATUSES)[keyof typeof HOT_CANDIDATE_GENERATION_STATUSES];

export type HotCandidateGenerationDocument = HydratedDocument<HotCandidateGeneration>;

@Schema({
  timestamps: true,
  collection: 'hot_candidate_generations',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class HotCandidateGeneration {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  generationId!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(HOT_CANDIDATE_GENERATION_STATUSES),
  })
  status!: HotCandidateGenerationStatus;

  @Prop({ type: String, default: null })
  cursorStateId!: string | null;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  version!: number;

  @Prop({ type: Date, default: null })
  claimedUntil!: Date | null;

  @Prop({ type: Date, default: null })
  activatedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const HotCandidateGenerationSchema = SchemaFactory.createForClass(HotCandidateGeneration);

HotCandidateGenerationSchema.index({ generationId: 1 }, { unique: true });
HotCandidateGenerationSchema.index(
  { status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: HOT_CANDIDATE_GENERATION_STATUSES.BUILDING },
  },
);
HotCandidateGenerationSchema.index({ status: 1, updatedAt: -1, _id: -1 });
