import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false, versionKey: false, strict: 'throw' })
export class FeedbackCountsDocument {
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  SPARK!: number;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  ON_POINT!: number;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  CONSTRUCTIVE!: number;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  RESONATE!: number;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  UNCLEAR!: number;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  OFF_TOPIC!: number;
  @Prop({ type: Number, required: true, min: 0, validate: Number.isInteger, default: 0 })
  NOISE!: number;
}

export const FeedbackCountsSchema = SchemaFactory.createForClass(FeedbackCountsDocument);
