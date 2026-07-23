import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type CirclePostVisibilityStateDocument = HydratedDocument<CirclePostVisibilityState>;

@Schema({
  timestamps: true,
  collection: 'circle_post_visibility_states',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class CirclePostVisibilityState {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  circleId!: string;

  @Prop({ type: Boolean, required: true })
  desiredVisible!: boolean;

  @Prop({ type: Number, required: true, min: 1 })
  visibilityVersion!: number;

  @Prop({ type: Number, required: true, min: 0 })
  processedVisibilityVersion!: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  postWriteVersion!: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  processedPostWriteVersion!: number;

  @Prop({ type: Boolean, required: true, default: false })
  dirty!: boolean;

  @Prop({ type: Date, default: null })
  dispatchAt!: Date | null;

  @Prop({ type: String, default: null })
  claimToken!: string | null;

  @Prop({ type: Date, default: null })
  claimedUntil!: Date | null;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  dispatchAttempts!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CirclePostVisibilityStateSchema =
  SchemaFactory.createForClass(CirclePostVisibilityState);

CirclePostVisibilityStateSchema.index({ circleId: 1 }, { unique: true });
CirclePostVisibilityStateSchema.index(
  { dirty: 1, dispatchAt: 1, _id: 1, claimedUntil: 1 },
  { partialFilterExpression: { dirty: true } },
);
