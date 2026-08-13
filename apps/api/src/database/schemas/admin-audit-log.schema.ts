import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Schema as MongooseSchema } from 'mongoose';
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

type MiddlewareNext = (error?: Error) => void;
const immutableAdminAuditError = new Error('管理员审计日志只允许追加，禁止修改或删除');
const AUDIT_CHANGE_KEY_PATTERN = /^[a-z][a-zA-Z0-9_.-]{0,63}$/u;
const AUDIT_CHANGE_MAX_ENTRIES = 50;
const AUDIT_CHANGE_MAX_STRING_LENGTH = 2_000;

function isBoundedAuditValue(value: AdminAuditJsonValue, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof value === 'string') return value.length <= AUDIT_CHANGE_MAX_STRING_LENGTH;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) {
    return value.length <= AUDIT_CHANGE_MAX_ENTRIES && value.every((item) => isBoundedAuditValue(item, depth + 1));
  }
  const entries = Object.entries(value);
  return entries.length <= AUDIT_CHANGE_MAX_ENTRIES && entries.every(
    ([key, item]) => AUDIT_CHANGE_KEY_PATTERN.test(key) && isBoundedAuditValue(item, depth + 1),
  );
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'admin_audit_logs',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class AdminAuditLog {
  id!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(ADMIN_AUDIT_ACTOR_TYPES) })
  actorType!: AdminAuditActorType;

  @Prop({ type: String, default: null, immutable: true })
  actorUserId!: string | null;

  @Prop({ type: String, required: true, immutable: true, maxlength: 120 })
  action!: string;

  @Prop({ type: String, required: true, immutable: true, maxlength: 80 })
  targetType!: string;

  @Prop({ type: String, required: true, immutable: true, maxlength: 160 })
  targetId!: string;

  @Prop({ type: String, default: null, immutable: true, maxlength: 500 })
  reason!: string | null;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: {},
    immutable: true,
    validate: {
      validator: (value: AdminAuditJsonValue) =>
        value !== null && !Array.isArray(value) && isBoundedAuditValue(value),
      message: '审计变更必须是有界 JSON 对象',
    },
  })
  changes!: Record<string, AdminAuditJsonValue>;

  @Prop({ type: String, default: null, immutable: true, maxlength: 160 })
  requestId!: string | null;

  createdAt!: Date;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);

AdminAuditLogSchema.index({ createdAt: -1, _id: -1 });
AdminAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

AdminAuditLogSchema.pre('save', function (next: MiddlewareNext) {
  next(this.isNew ? undefined : immutableAdminAuditError);
});

AdminAuditLogSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next: MiddlewareNext) {
    next(immutableAdminAuditError);
  },
);

AdminAuditLogSchema.pre('deleteOne', { document: true, query: false }, function (next: MiddlewareNext) {
  next(immutableAdminAuditError);
});
