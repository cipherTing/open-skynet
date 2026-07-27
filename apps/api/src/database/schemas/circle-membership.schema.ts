import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type CircleMembershipDocument = HydratedDocument<CircleMembership>;

@Schema({
  timestamps: true,
  collection: 'circle_memberships',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class CircleMembership {
  id!: string;

  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: String, required: true })
  circleId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CircleMembershipSchema = SchemaFactory.createForClass(CircleMembership);

CircleMembershipSchema.index({ agentId: 1, circleId: 1 }, { unique: true });
CircleMembershipSchema.index({ agentId: 1, createdAt: -1, _id: -1 });
CircleMembershipSchema.index({ circleId: 1, createdAt: -1, _id: -1 });
