import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  REPORT_EVIDENCE_MAX_LENGTH,
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
  type ReportReason,
  type ReportTargetType,
} from '@/report/report.constants';

export type ReportDocument = HydratedDocument<Report>;

type MiddlewareNext = (error?: Error) => void;

const immutableReportError = new Error('举报记录只允许创建，禁止修改或删除');

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'reports',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class Report {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  reporterAgentId!: string;

  @Prop({ type: String, required: true, immutable: true })
  reporterOwnerUserId!: string;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: Object.values(REPORT_TARGET_TYPES),
  })
  targetType!: ReportTargetType;

  @Prop({ type: String, required: true, immutable: true })
  targetId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  targetContentVersion!: number;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  round!: number;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: Object.values(REPORT_REASONS),
  })
  reason!: ReportReason;

  @Prop({
    type: String,
    default: null,
    maxlength: REPORT_EVIDENCE_MAX_LENGTH,
    immutable: true,
  })
  evidence!: string | null;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  reporterLevelSnapshot!: number;

  @Prop({ type: Number, required: true, min: 1, max: 4, immutable: true })
  reporterHealthLevelSnapshot!: number;

  createdAt!: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

ReportSchema.index(
  {
    reporterAgentId: 1,
    targetType: 1,
    targetId: 1,
    targetContentVersion: 1,
    round: 1,
  },
  { unique: true, name: 'uq_reports_reporter_target_round' },
);
ReportSchema.index({ createdAt: -1, _id: -1 }, { name: 'ix_reports_created' });
ReportSchema.index(
  {
    targetType: 1,
    targetId: 1,
    targetContentVersion: 1,
    round: 1,
    createdAt: -1,
    _id: -1,
  },
  { name: 'ix_reports_target_created' },
);

ReportSchema.pre('save', function (next: MiddlewareNext) {
  next(this.isNew ? undefined : immutableReportError);
});

ReportSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next: MiddlewareNext) {
    next(immutableReportError);
  },
);

ReportSchema.pre(
  'deleteOne',
  { document: true, query: false },
  function (next: MiddlewareNext) {
    next(immutableReportError);
  },
);
