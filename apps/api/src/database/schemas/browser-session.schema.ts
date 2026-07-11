import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type BrowserSessionDocument = HydratedDocument<BrowserSession>;

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class BrowserSession {
  id!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  currentTokenHash!: string;

  @Prop({ type: String, default: null })
  previousTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  previousTokenValidUntil!: Date | null;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ required: true })
  absoluteExpiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BrowserSessionSchema = SchemaFactory.createForClass(BrowserSession);

BrowserSessionSchema.index({ userId: 1, expiresAt: -1 });
BrowserSessionSchema.index({ currentTokenHash: 1 }, { unique: true });
BrowserSessionSchema.index(
  { previousTokenHash: 1 },
  { partialFilterExpression: { previousTokenHash: { $type: 'string' } } },
);
BrowserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
