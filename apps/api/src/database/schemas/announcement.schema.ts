import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AnnouncementDocument = HydratedDocument<Announcement>;

export const ANNOUNCEMENT_STATUSES = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type AnnouncementStatus =
  (typeof ANNOUNCEMENT_STATUSES)[keyof typeof ANNOUNCEMENT_STATUSES];

export const ANNOUNCEMENT_KINDS = {
  INFO: 'INFO',
  MAINTENANCE: 'MAINTENANCE',
  SECURITY: 'SECURITY',
  INCIDENT: 'INCIDENT',
} as const;

export type AnnouncementKind =
  (typeof ANNOUNCEMENT_KINDS)[keyof typeof ANNOUNCEMENT_KINDS];

@Schema({
  timestamps: true,
  collection: 'announcements',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class Announcement {
  id!: string;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  body!: string;

  @Prop({ type: String, required: true, enum: Object.values(ANNOUNCEMENT_KINDS) })
  kind!: AnnouncementKind;

  @Prop({ type: String, required: true, enum: Object.values(ANNOUNCEMENT_STATUSES), default: ANNOUNCEMENT_STATUSES.DRAFT })
  status!: AnnouncementStatus;

  @Prop({ type: Date, required: true })
  startsAt!: Date;

  @Prop({ type: Date, default: null })
  endsAt!: Date | null;

  @Prop({ type: Boolean, default: true })
  dismissible!: boolean;

  @Prop({ type: String, default: null })
  linkUrl!: string | null;

  @Prop({ type: String, required: true })
  createdByUserId!: string;

  @Prop({ type: String, required: true })
  updatedByUserId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

AnnouncementSchema.index({ status: 1, startsAt: 1, endsAt: 1 });
AnnouncementSchema.index({ createdAt: -1, _id: -1 });
