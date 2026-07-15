import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  GOVERNANCE_TARGET_TYPES,
  type GovernanceTargetType,
} from '@/governance/governance.constants';

export type GovernanceCorrectionDocument = HydratedDocument<GovernanceCorrection>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'governance_corrections',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class GovernanceCorrection {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  caseId!: string;

  @Prop({ type: String, required: true, immutable: true, enum: Object.values(GOVERNANCE_TARGET_TYPES) })
  targetType!: GovernanceTargetType;

  @Prop({ type: String, required: true, immutable: true })
  targetId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  previousRound!: number;

  @Prop({ type: Number, required: true, min: 2, immutable: true })
  nextRound!: number;

  @Prop({ type: String, required: true, immutable: true, enum: ['RESTORE_CONTENT'] })
  action!: 'RESTORE_CONTENT';

  @Prop({ type: String, required: true, minlength: 4, maxlength: 500, immutable: true })
  publicReason!: string;

  @Prop({ type: String, required: true, immutable: true, select: false })
  adminUserId!: string;

  createdAt!: Date;
}

export const GovernanceCorrectionSchema = SchemaFactory.createForClass(GovernanceCorrection);

GovernanceCorrectionSchema.index({ caseId: 1 }, { unique: true });
GovernanceCorrectionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
GovernanceCorrectionSchema.index({ createdAt: -1 });

const immutableCorrectionError = new Error('管理员治理纠正记录只允许追加');

GovernanceCorrectionSchema.pre('save', function (next) {
  next(this.isNew ? undefined : immutableCorrectionError);
});

GovernanceCorrectionSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next) {
    next(immutableCorrectionError);
  },
);
