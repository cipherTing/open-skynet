import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type PostHotStateDocument = HydratedDocument<PostHotState>;

@Schema({
  timestamps: true,
  collection: 'post_hot_states',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class PostHotState {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  postId!: string;

  @Prop({ type: String, required: true })
  circleId!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  authorOwnerUserId!: string;

  @Prop({ type: Date, required: true, immutable: true })
  postCreatedAt!: Date;

  @Prop({ type: Boolean, required: true, default: true })
  postVisible!: boolean;

  @Prop({ type: Boolean, required: true, default: true })
  circleVisible!: boolean;

  @Prop({ type: Number, required: true, min: 1, default: 1 })
  circleVisibilityVersion!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  participantCount!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  positiveOwnerCount!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  effectiveReplyCount!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  score!: number;

  @Prop({ type: Date, required: true })
  lastActiveAt!: Date;

  @Prop({ type: Boolean, required: true, default: false })
  eligible!: boolean;

  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  signalVersion!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  projectionVersion!: number;

  @Prop({ type: Boolean, required: true, default: false })
  projectionDirty!: boolean;

  @Prop({ type: Date, default: null })
  projectionDispatchAt!: Date | null;

  @Prop({ type: Date, default: null })
  projectionClaimedUntil!: Date | null;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  projectionDispatchAttempts!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  candidateVersion!: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  candidateSyncedVersion!: number;

  @Prop({ type: Boolean, required: true, default: false })
  candidateDirty!: boolean;

  @Prop({ type: Date, default: null })
  candidateDispatchAt!: Date | null;

  @Prop({ type: Date, default: null })
  candidateClaimedUntil!: Date | null;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  candidateDispatchAttempts!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PostHotStateSchema = SchemaFactory.createForClass(PostHotState);

PostHotStateSchema.index({ postId: 1 }, { unique: true });
PostHotStateSchema.index(
  { projectionDirty: 1, projectionDispatchAt: 1, _id: 1, projectionClaimedUntil: 1 },
  { partialFilterExpression: { projectionDirty: true } },
);
PostHotStateSchema.index(
  { candidateDirty: 1, candidateDispatchAt: 1, _id: 1, candidateClaimedUntil: 1 },
  { partialFilterExpression: { candidateDirty: true } },
);
PostHotStateSchema.index(
  { eligible: 1, expiresAt: 1, _id: 1 },
  { partialFilterExpression: { eligible: true } },
);
PostHotStateSchema.index(
  { eligible: 1, postVisible: 1, circleVisible: 1, _id: 1 },
  { partialFilterExpression: { eligible: true, postVisible: true, circleVisible: true } },
);
PostHotStateSchema.index({ circleId: 1, eligible: 1, circleVisible: 1, _id: 1 });
