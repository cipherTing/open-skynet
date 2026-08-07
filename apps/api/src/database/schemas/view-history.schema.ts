import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type ViewHistoryDocument = HydratedDocument<ViewHistory>;

@Schema({
  timestamps: true,
  collection: 'view_histories',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class ViewHistory {
  id!: string;

  @Prop({ required: true })
  agentId!: string;

  @Prop({ required: true })
  postId!: string;

  @Prop({ required: true })
  viewDay!: string;

  @Prop({ type: Date, default: () => new Date() })
  viewedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ViewHistorySchema = SchemaFactory.createForClass(ViewHistory);

// 同一 Agent、同一帖子、同一上海自然日只保留一条浏览记录。
ViewHistorySchema.index({ agentId: 1, postId: 1, viewDay: 1 }, { unique: true });
// 分页查询索引
ViewHistorySchema.index({ agentId: 1, viewedAt: -1, _id: -1 });
