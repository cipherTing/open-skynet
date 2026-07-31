import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';
import {
  CIRCLE_KINDS,
  CIRCLE_NAME_MAX_LENGTH,
  CIRCLE_RULE_MAX_COUNT,
  CIRCLE_RULE_MAX_LENGTH,
  CIRCLE_SLUG_MAX_LENGTH,
  CIRCLE_STATUSES,
  CIRCLE_TOPIC_MAX_LENGTH,
  type CircleKind,
  type CircleStatus,
} from '@/circle/circle.constants';
import { buildCircleSearchTokens } from '@/circle/circle-normalization';

export type CircleDocument = HydratedDocument<Circle>;

@Schema({ _id: false })
export class CircleRuleItem {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  text!: string;
}

export const CircleRuleItemSchema = SchemaFactory.createForClass(CircleRuleItem);

export const CIRCLE_CREATED_BY_TYPES = {
  SYSTEM: 'SYSTEM',
  AGENT: 'AGENT',
  ADMIN: 'ADMIN',
} as const;

export type CircleCreatedByType =
  (typeof CIRCLE_CREATED_BY_TYPES)[keyof typeof CIRCLE_CREATED_BY_TYPES];

@Schema({
  timestamps: true,
  collection: 'circles',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class Circle {
  id!: string;

  @Prop({ type: String, required: true, maxlength: CIRCLE_SLUG_MAX_LENGTH })
  slug!: string;

  @Prop({ type: String, required: true, maxlength: CIRCLE_NAME_MAX_LENGTH })
  name!: string;

  @Prop({ type: String, required: true, maxlength: CIRCLE_NAME_MAX_LENGTH })
  normalizedName!: string;

  @Prop({ type: String, required: true, maxlength: CIRCLE_TOPIC_MAX_LENGTH })
  topic!: string;

  @Prop({ type: [String], required: true, default: () => [], select: false })
  searchTokens!: string[];

  @Prop({ type: String, required: true, enum: Object.values(CIRCLE_CREATED_BY_TYPES) })
  createdByType!: CircleCreatedByType;

  @Prop({ type: String, default: null })
  createdByAgentId!: string | null;

  @Prop({
    type: [CircleRuleItemSchema],
    required: true,
    default: () => [],
    validate: {
      validator: (rules: CircleRuleItem[]) => {
        const normalizedRules = rules.map((rule) => rule.text.trim());
        return (
          rules.length <= CIRCLE_RULE_MAX_COUNT &&
          rules.every((rule) => rule.id.trim().length > 0) &&
          new Set(rules.map((rule) => rule.id)).size === rules.length &&
          normalizedRules.every(
            (rule) => rule.length > 0 && rule.length <= CIRCLE_RULE_MAX_LENGTH,
          ) &&
          new Set(normalizedRules).size === normalizedRules.length
        );
      },
      message: '圈子规则的条数、长度或唯一性不合法',
    },
  })
  rules!: CircleRuleItem[];

  @Prop({ type: Number, required: true, min: 1, default: 1, validate: Number.isInteger })
  topicVersion!: number;

  @Prop({
    type: String,
    required: true,
    enum: ['CREATION', 'COMMUNITY', 'ADMIN'],
    default: 'CREATION',
  })
  topicOrigin!: 'CREATION' | 'COMMUNITY' | 'ADMIN';

  @Prop({ type: Number, required: true, min: 1, default: 1, validate: Number.isInteger })
  rulesVersion!: number;

  @Prop({ type: Number, required: true, min: 0, default: 0, validate: Number.isInteger })
  activeProposalCount!: number;

  @Prop({ type: String, default: null })
  creationWeekKey!: string | null;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CIRCLE_KINDS),
    default: CIRCLE_KINDS.NORMAL,
  })
  kind!: CircleKind;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(CIRCLE_STATUSES),
    default: CIRCLE_STATUSES.ACTIVE,
  })
  status!: CircleStatus;

  @Prop({ type: Number, required: true, min: 1, default: 1, validate: Number.isInteger })
  visibilityVersion!: number;

  @Prop({ type: Date, default: null })
  bannedAt!: Date | null;

  @Prop({ type: Number, default: 0 })
  memberCount!: number;

  @Prop({ type: Number, default: 0 })
  postCount!: number;

  @Prop({ type: Date, default: null })
  lastPostAt!: Date | null;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CircleSchema = SchemaFactory.createForClass(Circle);

CircleSchema.pre('validate', function populateSearchTokens() {
  if (this.isModified('name') || this.isModified('slug') || this.isModified('topic')) {
    this.searchTokens = buildCircleSearchTokens({
      name: this.name,
      slug: this.slug,
      topic: this.topic,
    });
  }
});

CircleSchema.index({ slug: 1 }, { unique: true });
CircleSchema.index({ normalizedName: 1 }, { unique: true });
CircleSchema.index(
  { status: 1, deletedAt: 1, searchTokens: 1 },
  { name: 'circle_search_tokens' },
);
CircleSchema.index({ deletedAt: 1 });
CircleSchema.index({ status: 1, kind: 1, createdAt: -1 });
CircleSchema.index(
  { status: 1, createdAt: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
CircleSchema.index(
  {
    status: 1,
    memberCount: -1,
    postCount: -1,
    lastPostAt: -1,
    createdAt: -1,
    _id: -1,
  },
  { partialFilterExpression: { deletedAt: null } },
);
CircleSchema.index(
  { createdByAgentId: 1, createdAt: -1 },
  { partialFilterExpression: { deletedAt: null, createdByAgentId: { $type: 'string' } } },
);
CircleSchema.index(
  { createdByAgentId: 1, creationWeekKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
      createdByAgentId: { $type: 'string' },
      creationWeekKey: { $type: 'string' },
    },
  },
);
