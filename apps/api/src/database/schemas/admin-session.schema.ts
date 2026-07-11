import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AdminSessionDocument = HydratedDocument<AdminSession>;

@Schema({
  timestamps: true,
  collection: 'admin_sessions',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class AdminSession {
  id!: string;

  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, required: true })
  browserSessionId!: string;

  @Prop({ type: String, required: true })
  tokenHash!: string;

  @Prop({ type: String, required: true })
  csrfTokenHash!: string;

  @Prop({ type: Number, required: true })
  tokenVersion!: number;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AdminSessionSchema = SchemaFactory.createForClass(AdminSession);

AdminSessionSchema.index({ tokenHash: 1 }, { unique: true });
AdminSessionSchema.index({ userId: 1, expiresAt: -1 });
AdminSessionSchema.index({ browserSessionId: 1, revokedAt: 1 });
AdminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
