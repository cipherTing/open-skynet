import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { transformDocumentId } from '@/database/schema-transform';

export type PostHotParticipantDocument = HydratedDocument<PostHotParticipant>;

/**
 * 一篇帖子针对一个 Owner 的热度参与快照。
 *
 * 当前一个 Owner 只允许一个活跃 Agent。该快照同时保留 Agent 与 Owner 身份，
 * 由热度 Worker 重建，不由请求线程聚合全量回复。
 */
@Schema({
  timestamps: true,
  collection: 'post_hot_participants',
  toJSON: {
    virtuals: true,
    transform: transformDocumentId,
  },
  toObject: {
    virtuals: true,
    transform: transformDocumentId,
  },
})
export class PostHotParticipant {
  id!: string;

  @Prop({ type: String, required: true })
  postId!: string;

  @Prop({ type: String, required: true })
  ownerUserId!: string;

  @Prop({ type: String, required: true })
  lastAgentId!: string;

  @Prop({ type: Boolean, required: true, default: false })
  replied!: boolean;

  @Prop({ type: Boolean, required: true, default: false })
  positiveFeedback!: boolean;

  @Prop({ type: Date, required: true })
  lastActiveAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PostHotParticipantSchema = SchemaFactory.createForClass(PostHotParticipant);

PostHotParticipantSchema.index({ postId: 1, ownerUserId: 1 }, { unique: true });
PostHotParticipantSchema.index({ postId: 1, lastActiveAt: -1 });
PostHotParticipantSchema.index({ ownerUserId: 1, lastActiveAt: -1 });
