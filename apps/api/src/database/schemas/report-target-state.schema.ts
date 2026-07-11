import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  REPORT_TARGET_STATUSES,
  REPORT_TARGET_TYPES,
  type ReportTargetStatus,
  type ReportTargetType,
} from '@/report/report.constants';

export type ReportTargetStateDocument = HydratedDocument<ReportTargetState>;

@Schema({ _id: false })
export class QualifiedReporter {
  @Prop({ type: String, required: true })
  agentId!: string;

  @Prop({ type: String, required: true })
  ownerUserId!: string;
}

const QualifiedReporterSchema = SchemaFactory.createForClass(QualifiedReporter);

@Schema({
  timestamps: true,
  collection: 'report_target_states',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class ReportTargetState {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  targetKey!: string;

  @Prop({
    type: String,
    required: true,
    immutable: true,
    enum: Object.values(REPORT_TARGET_TYPES),
  })
  targetType!: ReportTargetType;

  @Prop({ type: String, required: true, immutable: true })
  targetId!: string;

  @Prop({ type: String, required: true, immutable: true })
  targetAuthorId!: string;

  @Prop({ type: [QualifiedReporterSchema], required: true, default: [] })
  qualifiedReporters!: QualifiedReporter[];

  @Prop({
    type: String,
    required: true,
    enum: Object.values(REPORT_TARGET_STATUSES),
    default: REPORT_TARGET_STATUSES.COLLECTING,
  })
  status!: ReportTargetStatus;

  @Prop({ type: String, default: null })
  caseId!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ReportTargetStateSchema = SchemaFactory.createForClass(ReportTargetState);

ReportTargetStateSchema.pre('validate', function (next) {
  const agentIds = this.qualifiedReporters.map((item) => item.agentId);
  const ownerUserIds = this.qualifiedReporters.map((item) => item.ownerUserId);
  if (new Set(agentIds).size !== agentIds.length) {
    next(new Error('同一 Agent 不能在目标举报状态中重复计数'));
    return;
  }
  if (new Set(ownerUserIds).size !== ownerUserIds.length) {
    next(new Error('同一主人不能在目标举报状态中重复计数'));
    return;
  }
  next();
});

ReportTargetStateSchema.index(
  { targetKey: 1 },
  { unique: true, name: 'uq_report_target_states_target_key' },
);
ReportTargetStateSchema.index(
  { caseId: 1 },
  {
    unique: true,
    name: 'uq_report_target_states_case_id',
    partialFilterExpression: { caseId: { $type: 'string' } },
  },
);
ReportTargetStateSchema.index(
  { status: 1, updatedAt: -1, _id: -1 },
  { name: 'ix_report_target_states_status_updated' },
);
ReportTargetStateSchema.index(
  { targetType: 1, targetId: 1 },
  { name: 'ix_report_target_states_target' },
);
