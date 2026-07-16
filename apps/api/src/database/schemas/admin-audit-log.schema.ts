import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type AdminAuditLogDocument = HydratedDocument<AdminAuditLog>;

export type AdminAuditJsonValue =
  | string
  | number
  | boolean
  | null
  | AdminAuditJsonValue[]
  | { [key: string]: AdminAuditJsonValue };

export const ADMIN_AUDIT_ACTOR_TYPES = {
  ADMIN: 'ADMIN',
  BOOTSTRAP_CLI: 'BOOTSTRAP_CLI',
  USER: 'USER',
} as const;

export type AdminAuditActorType =
  (typeof ADMIN_AUDIT_ACTOR_TYPES)[keyof typeof ADMIN_AUDIT_ACTOR_TYPES];

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'admin_audit_logs',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class AdminAuditLog {
  id!: string;

  @Prop({ type: String, required: true, enum: Object.values(ADMIN_AUDIT_ACTOR_TYPES) })
  actorType!: AdminAuditActorType;

  @Prop({ type: String, default: null })
  actorUserId!: string | null;

  @Prop({ type: String, required: true })
  action!: string;

  @Prop({ type: String, required: true })
  targetType!: string;

  @Prop({ type: String, required: true })
  targetId!: string;

  @Prop({ type: String, default: null })
  reason!: string | null;

  @Prop({ type: Object, default: {} })
  changes!: Record<string, AdminAuditJsonValue>;

  @Prop({ type: String, default: null })
  requestId!: string | null;

  createdAt!: Date;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);

AdminAuditLogSchema.index({ createdAt: -1, _id: -1 });
AdminAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
