import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type FilterQuery } from 'mongoose';
import {
  ADMIN_AUDIT_ACTOR_TYPES,
  AdminAuditLog,
  type AdminAuditLogDocument,
  type AdminAuditActorType,
  type AdminAuditJsonValue,
} from '@/database/schemas/admin-audit-log.schema';
import { User } from '@/database/schemas/user.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { ContentReviewRequest } from '@/database/schemas/content-review-request.schema';
import type { ListAdminAuditLogsDto } from './dto/list-admin-audit-logs.dto';

export interface RecordAdminAuditParams {
  actorType?: AdminAuditActorType;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  changes?: Record<string, AdminAuditJsonValue>;
  requestId?: string | null;
  session?: ClientSession;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLog>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleProposal.name)
    private readonly circleProposalModel: Model<CircleProposal>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(ContentReviewRequest.name)
    private readonly contentReviewModel: Model<ContentReviewRequest>,
  ) {}

  async record(params: RecordAdminAuditParams): Promise<void> {
    await new this.auditModel({
      actorType: params.actorType ?? ADMIN_AUDIT_ACTOR_TYPES.ADMIN,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason ?? null,
      changes: params.changes ?? {},
      requestId: params.requestId ?? null,
    }).save({ session: params.session });
  }

  async list(dto: ListAdminAuditLogsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where: FilterQuery<AdminAuditLog> = {};
    if (dto.action) where.action = dto.action;
    if (dto.targetType) where.targetType = dto.targetType;
    if (dto.from || dto.to) {
      where.createdAt = {
        ...(dto.from ? { $gte: new Date(dto.from) } : {}),
        ...(dto.to ? { $lte: new Date(dto.to) } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.auditModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.auditModel.countDocuments(where),
    ]);

    const resolvedItems = await Promise.all(items.map((item) => this.serialize(item)));

    return {
      items: resolvedItems,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('操作日志不存在');
    const item = await this.auditModel.findById(id);
    if (!item) throw new NotFoundException('操作日志不存在');
    return this.serialize(item);
  }

  private async serialize(item: AdminAuditLogDocument) {
    const [actor, target] = await Promise.all([
      item.actorUserId
        ? this.userModel.findById(item.actorUserId).select('username').lean()
        : Promise.resolve(null),
      this.resolveTarget(item.targetType, item.targetId),
    ]);
    return {
      ...item.toObject(),
      actor: {
        id: item.actorUserId,
        label: actor?.username ?? (item.actorType === 'BOOTSTRAP_CLI' ? '管理员初始化命令' : '管理员'),
      },
      target,
    };
  }

  private async resolveTarget(targetType: string, targetId: string) {
    if (!Types.ObjectId.isValid(targetId)) {
      return { id: targetId, type: targetType, label: targetId };
    }
    if (targetType === 'AGENT') {
      const agent = await this.agentModel.findById(targetId).select('name').lean();
      return { id: targetId, type: targetType, label: agent?.name ?? '已离线 Agent' };
    }
    if (targetType === 'POST') {
      const post = await this.postModel.findOne({ _id: targetId, deletedAt: { $exists: true } }).select('title').lean();
      return { id: targetId, type: targetType, label: post?.title ?? '已删除帖子' };
    }
    if (targetType === 'REPLY') {
      const reply = await this.replyModel.findOne({ _id: targetId, deletedAt: { $exists: true } }).select('content').lean();
      const excerpt = reply?.content.replace(/\s+/g, ' ').trim() ?? '';
      return { id: targetId, type: targetType, label: excerpt ? excerpt.slice(0, 60) : '已删除回复' };
    }
    if (targetType === 'CIRCLE') {
      const circle = await this.circleModel.findOne({ _id: targetId, deletedAt: { $exists: true } }).select('name').lean();
      return { id: targetId, type: targetType, label: circle?.name ?? '已删除圈子' };
    }
    if (targetType === 'CIRCLE_PROPOSAL') {
      const proposal = await this.circleProposalModel.findById(targetId).select('scope').lean();
      return { id: targetId, type: targetType, label: proposal?.scope === 'TOPIC' ? '圈子简介提案' : proposal ? '圈子规则提案' : '已删除提案' };
    }
    if (targetType === 'GOVERNANCE_CASE') {
      const governanceCase = await this.governanceCaseModel.findById(targetId).select('targetSnapshot').lean();
      const snapshot = governanceCase?.targetSnapshot;
      const label = snapshot?.kind === 'POST' || snapshot?.kind === 'REPLY'
        ? snapshot.post.title
        : snapshot?.kind === 'CIRCLE_PROPOSAL'
          ? (snapshot.proposal.scope === 'TOPIC' ? '圈子简介提案案件' : '圈子规则提案案件')
          : snapshot ? '圈子共建评论案件' : '已删除治理案件';
      return { id: targetId, type: targetType, label };
    }
    if (targetType === 'CONTENT_REVIEW') {
      const review = await this.contentReviewModel.findById(targetId).select('type payload').lean();
      const label = review?.type === 'POST' && 'title' in review.payload
        ? review.payload.title
        : review?.type === 'CIRCLE' && 'name' in review.payload
          ? review.payload.name
          : '已删除审核申请';
      return { id: targetId, type: targetType, label };
    }
    return { id: targetId, type: targetType, label: targetId };
  }
}
