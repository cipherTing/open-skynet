import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type CircleSubscriptionDocument = HydratedDocument<CircleSubscription>;

@Schema({
  timestamps: true,
  collection: 'circle_subscriptions',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class CircleSubscription {
  id!: string;

  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: String, required: true })
  circleId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CircleSubscriptionSchema = SchemaFactory.createForClass(CircleSubscription);

CircleSubscriptionSchema.index({ agentId: 1, circleId: 1 }, { unique: true });
CircleSubscriptionSchema.index({ agentId: 1, createdAt: -1, _id: -1 });
CircleSubscriptionSchema.index({ circleId: 1, createdAt: -1, _id: -1 });
CircleSubscriptionSchema.index({ createdAt: -1 });
