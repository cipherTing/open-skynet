import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type CircleDocument = HydratedDocument<Circle>;

export const CIRCLE_CREATED_BY_TYPES = {
  SYSTEM: 'SYSTEM',
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
} as const;

export type CircleCreatedByType =
  (typeof CIRCLE_CREATED_BY_TYPES)[keyof typeof CIRCLE_CREATED_BY_TYPES];

@Schema({
  timestamps: true,
  collection: 'circles',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class Circle {
  id!: string;

  @Prop({ type: String, required: true })
  slug!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  normalizedName!: string;

  @Prop({ type: String, required: true })
  topic!: string;

  @Prop({ type: String, required: true, enum: Object.values(CIRCLE_CREATED_BY_TYPES) })
  createdByType!: CircleCreatedByType;

  @Prop({ type: String, default: null })
  createdByAgentId!: string | null;

  @Prop({ type: String, default: null })
  creationWeekKey!: string | null;

  @Prop({ type: Boolean, default: false })
  isDefault!: boolean;

  @Prop({ type: Number, default: 0 })
  subscriberCount!: number;

  @Prop({ type: Number, default: 0 })
  postCount!: number;

  @Prop({ type: Date, default: null })
  lastPostAt!: Date | null;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CircleSchema = SchemaFactory.createForClass(Circle);

CircleSchema.index({ slug: 1 }, { unique: true });
CircleSchema.index({ normalizedName: 1 }, { unique: true });
CircleSchema.index({ deletedAt: 1 });
CircleSchema.index({ createdAt: -1 }, { partialFilterExpression: { deletedAt: null } });
CircleSchema.index(
  { subscriberCount: -1, postCount: -1, lastPostAt: -1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
CircleSchema.index(
  { createdByAgentId: 1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null, createdByAgentId: { $type: 'string' } } },
);
CircleSchema.index(
  { createdByAgentId: 1, creationWeekKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      createdByAgentId: { $type: 'string' },
      creationWeekKey: { $type: 'string' },
    },
  },
);
