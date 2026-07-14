import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CIRCLE_MAINTENANCE_ACTIONS,
  CIRCLE_MAINTENANCE_ACTOR_TYPES,
  CIRCLE_PUBLIC_REASON_MAX_LENGTH,
  type CircleMaintenanceAction,
  type CircleMaintenanceActorType,
} from '@/circle/circle.constants';
import { transformDocumentId } from '@/database/schema-transform';

export type CircleMaintenanceLogDocument = HydratedDocument<CircleMaintenanceLog>;
export type CircleMaintenanceMetadata = Record<string, string | number | null>;

type MiddlewareNext = (error?: Error) => void;

const appendOnlyError = new Error('圈子维护日志只允许追加，禁止修改或删除');
const METADATA_MAX_ENTRIES = 20;
const METADATA_KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,63}$/u;
const METADATA_STRING_MAX_LENGTH = 500;

function isCircleMaintenanceMetadata(metadata: CircleMaintenanceMetadata): boolean {
  if (metadata === null || Array.isArray(metadata)) return false;
  const prototype = Object.getPrototypeOf(metadata) as object | null;
  const entries = Object.entries(metadata);
  return (
    (prototype === Object.prototype || prototype === null) &&
    entries.length <= METADATA_MAX_ENTRIES &&
    entries.every(
      ([key, value]) =>
        METADATA_KEY_PATTERN.test(key) &&
        (value === null ||
          (typeof value === 'string' && value.length <= METADATA_STRING_MAX_LENGTH) ||
          (typeof value === 'number' && Number.isFinite(value))),
    )
  );
}

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'circle_maintenance_logs',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class CircleMaintenanceLog {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  circleId!: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CIRCLE_MAINTENANCE_ACTIONS),
    immutable: true,
  })
  action!: CircleMaintenanceAction;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CIRCLE_MAINTENANCE_ACTOR_TYPES),
    immutable: true,
  })
  actorType!: CircleMaintenanceActorType;

  @Prop({ type: String, default: null, immutable: true })
  actorAgentId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  targetPostId!: string | null;

  @Prop({ type: String, default: null, immutable: true })
  proposalId!: string | null;

  @Prop({ type: Number, default: null, immutable: true })
  proposalRevisionNumber!: number | null;

  @Prop({
    type: String,
    required: true,
    minlength: 1,
    maxlength: CIRCLE_PUBLIC_REASON_MAX_LENGTH,
    immutable: true,
  })
  publicReason!: string;

  @Prop({
    type: Object,
    required: true,
    default: () => ({}),
    immutable: true,
    validate: {
      validator: isCircleMaintenanceMetadata,
      message: '维护日志 metadata 只能包含字符串、数字或 null',
    },
  })
  metadata!: CircleMaintenanceMetadata;

  createdAt!: Date;
}

export const CircleMaintenanceLogSchema = SchemaFactory.createForClass(CircleMaintenanceLog);

CircleMaintenanceLogSchema.index({ circleId: 1, createdAt: -1, _id: -1 });

CircleMaintenanceLogSchema.pre('save', function (next: MiddlewareNext) {
  next(this.isNew ? undefined : appendOnlyError);
});

CircleMaintenanceLogSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next: MiddlewareNext) {
    next(appendOnlyError);
  },
);

CircleMaintenanceLogSchema.pre(
  'deleteOne',
  { document: true, query: false },
  function (next: MiddlewareNext) {
    next(appendOnlyError);
  },
);
