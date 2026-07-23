import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type InvitationCodeDocument = HydratedDocument<InvitationCode>;

@Schema({
  collection: 'invitation_codes',
  timestamps: true,
  toJSON: { virtuals: true, transform: transformDocumentId },
})
export class InvitationCode {
  id!: string;

  @Prop({ required: true, unique: true, select: false })
  codeDigest!: string;

  @Prop({ required: true })
  prefix!: string;

  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  @Prop({ type: Date, default: null })
  usedAt!: Date | null;

  @Prop({ type: String, default: null })
  usedByUserId!: string | null;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ required: true })
  createdByUserId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const InvitationCodeSchema = SchemaFactory.createForClass(InvitationCode);
InvitationCodeSchema.index({ createdAt: -1 });
InvitationCodeSchema.index({ usedAt: 1, revokedAt: 1, expiresAt: 1 });
