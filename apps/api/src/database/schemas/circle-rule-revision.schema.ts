import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CIRCLE_RULE_MAX_COUNT,
  CIRCLE_RULE_MAX_LENGTH,
  CIRCLE_RULE_REVISION_SOURCES,
  type CircleRuleRevisionSource,
} from '@/circle/circle.constants';
import { transformDocumentId } from '@/database/schema-transform';

export type CircleRuleRevisionDocument = HydratedDocument<CircleRuleRevision>;

type MiddlewareNext = (error?: Error) => void;

const appendOnlyError = new Error('圈子规则历史只允许追加，禁止修改或删除');

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'circle_rule_revisions',
  toJSON: { virtuals: true, transform: transformDocumentId },
  toObject: { virtuals: true, transform: transformDocumentId },
})
export class CircleRuleRevision {
  id!: string;

  @Prop({ type: String, required: true, immutable: true })
  circleId!: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    immutable: true,
    validate: Number.isInteger,
  })
  version!: number;

  @Prop({
    type: [String],
    required: true,
    immutable: true,
    validate: {
      validator: (rules: string[]) => {
        const normalizedRules = rules.map((rule) => rule.trim());
        return (
          rules.length <= CIRCLE_RULE_MAX_COUNT &&
          normalizedRules.every(
            (rule) => rule.length > 0 && rule.length <= CIRCLE_RULE_MAX_LENGTH,
          ) &&
          new Set(normalizedRules).size === normalizedRules.length
        );
      },
      message: '圈子规则历史的条数、长度或唯一性不合法',
    },
  })
  rules!: string[];

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CIRCLE_RULE_REVISION_SOURCES),
    immutable: true,
  })
  source!: CircleRuleRevisionSource;

  @Prop({ type: String, default: null, immutable: true })
  actorAgentId!: string | null;

  createdAt!: Date;
}

export const CircleRuleRevisionSchema = SchemaFactory.createForClass(CircleRuleRevision);

CircleRuleRevisionSchema.index({ circleId: 1, version: 1 }, { unique: true });

CircleRuleRevisionSchema.pre('save', function (next: MiddlewareNext) {
  next(this.isNew ? undefined : appendOnlyError);
});

CircleRuleRevisionSchema.pre(
  /^(update|updateOne|updateMany|replaceOne|findOneAndUpdate|findOneAndReplace|deleteOne|deleteMany|findOneAndDelete|findOneAndRemove)$/,
  function (next: MiddlewareNext) {
    next(appendOnlyError);
  },
);

CircleRuleRevisionSchema.pre(
  'deleteOne',
  { document: true, query: false },
  function (next: MiddlewareNext) {
    next(appendOnlyError);
  },
);
