import { Injectable } from '@nestjs/common';
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
import { InvitationCode } from '@/database/schemas/invitation-code.schema';
import type { ListAdminAuditLogsDto } from './dto/list-admin-audit-logs.dto';
import { translateApiText } from '@/common/i18n/api-language';
import { adminErrors } from '@/common/errors/business-errors';

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
    @InjectModel(InvitationCode.name)
    private readonly invitationCodeModel: Model<InvitationCode>,
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

    const resolvedItems = await this.serializeMany(items);

    return {
      items: resolvedItems,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) throw adminErrors.auditLogNotFound();
    const item = await this.auditModel.findById(id);
    if (!item) throw adminErrors.auditLogNotFound();
    return this.serialize(item);
  }

  private async serializeMany(items: AdminAuditLogDocument[]) {
    const actorIds = [
      ...new Set(items.flatMap((item) => (item.actorUserId ? [item.actorUserId] : []))),
    ];
    const targetIdsByType = new Map<string, string[]>();
    for (const item of items) {
      if (!Types.ObjectId.isValid(item.targetId)) continue;
      const ids = targetIdsByType.get(item.targetType) ?? [];
      if (!ids.includes(item.targetId)) ids.push(item.targetId);
      targetIdsByType.set(item.targetType, ids);
    }
    const ids = (targetType: string) => targetIdsByType.get(targetType) ?? [];
    const [
      actors,
      agents,
      posts,
      replies,
      circles,
      proposals,
      governanceCases,
      reviews,
      invitations,
    ] = await Promise.all([
      actorIds.length
        ? this.userModel
            .find({ _id: { $in: actorIds } })
            .select('username')
            .lean()
        : Promise.resolve([]),
      ids('AGENT').length
        ? this.agentModel
            .find({ _id: { $in: ids('AGENT') } })
            .select('name')
            .lean()
        : Promise.resolve([]),
      ids('POST').length
        ? this.postModel
            .find({ _id: { $in: ids('POST') } })
            .select('title')
            .lean()
        : Promise.resolve([]),
      ids('REPLY').length
        ? this.replyModel
            .find({ _id: { $in: ids('REPLY') } })
            .select('content')
            .lean()
        : Promise.resolve([]),
      ids('CIRCLE').length
        ? this.circleModel
            .find({ _id: { $in: ids('CIRCLE') } })
            .select('name')
            .lean()
        : Promise.resolve([]),
      ids('CIRCLE_PROPOSAL').length
        ? this.circleProposalModel
            .find({ _id: { $in: ids('CIRCLE_PROPOSAL') } })
            .select('scope')
            .lean()
        : Promise.resolve([]),
      ids('GOVERNANCE_CASE').length
        ? this.governanceCaseModel
            .find({ _id: { $in: ids('GOVERNANCE_CASE') } })
            .select('targetSnapshot')
            .lean()
        : Promise.resolve([]),
      ids('CONTENT_REVIEW').length
        ? this.contentReviewModel
            .find({ _id: { $in: ids('CONTENT_REVIEW') } })
            .select('type payload')
            .lean()
        : Promise.resolve([]),
      ids('INVITATION_CODE').length
        ? this.invitationCodeModel
            .find({ _id: { $in: ids('INVITATION_CODE') } })
            .select('prefix')
            .lean()
        : Promise.resolve([]),
    ]);

    const actorMap = new Map(actors.map((actor) => [actor._id.toString(), actor.username]));
    const targetLabelMap = new Map<string, string>();
    for (const agent of agents) targetLabelMap.set(`AGENT:${agent._id.toString()}`, agent.name);
    for (const post of posts) targetLabelMap.set(`POST:${post._id.toString()}`, post.title);
    for (const reply of replies) {
      const excerpt = reply.content.replace(/\s+/g, ' ').trim();
      targetLabelMap.set(
        `REPLY:${reply._id.toString()}`,
        excerpt
          ? excerpt.slice(0, 60)
          : translateApiText('api.labels.deletedReply', 'Deleted reply'),
      );
    }
    for (const circle of circles)
      targetLabelMap.set(`CIRCLE:${circle._id.toString()}`, circle.name);
    for (const proposal of proposals) {
      targetLabelMap.set(
        `CIRCLE_PROPOSAL:${proposal._id.toString()}`,
        proposal.scope === 'TOPIC'
          ? translateApiText('api.labels.circleTopicProposal', 'Circle topic proposal')
          : translateApiText('api.labels.circleRulesProposal', 'Circle rules proposal'),
      );
    }
    for (const governanceCase of governanceCases) {
      const snapshot = governanceCase.targetSnapshot;
      const label =
        snapshot.kind === 'POST' || snapshot.kind === 'REPLY'
          ? snapshot.post.title
          : snapshot.kind === 'CIRCLE_PROPOSAL'
            ? snapshot.proposal.scope === 'TOPIC'
              ? translateApiText('api.labels.circleTopicProposalCase', 'Circle topic proposal case')
              : translateApiText('api.labels.circleRulesProposalCase', 'Circle rules proposal case')
            : translateApiText(
                'api.labels.circleProposalCommentCase',
                'Circle proposal comment case',
              );
      targetLabelMap.set(`GOVERNANCE_CASE:${governanceCase._id.toString()}`, label);
    }
    for (const review of reviews) {
      const label =
        review.type === 'POST' && 'title' in review.payload
          ? review.payload.title
          : review.type === 'CIRCLE' && 'name' in review.payload
            ? review.payload.name
            : translateApiText('api.labels.deletedContentReview', 'Deleted content review');
      targetLabelMap.set(`CONTENT_REVIEW:${review._id.toString()}`, label);
    }
    for (const invitation of invitations) {
      targetLabelMap.set(
        `INVITATION_CODE:${invitation._id.toString()}`,
        translateApiText(
          'api.labels.invitationCode',
          `Invitation code ${invitation.prefix}••••••••`,
          { prefix: invitation.prefix },
        ),
      );
    }

    return items.map((item) => ({
      ...item.toObject(),
      actor: {
        id: item.actorUserId,
        label: item.actorUserId
          ? (actorMap.get(item.actorUserId) ??
            translateApiText('api.labels.administrator', 'Administrator'))
          : item.actorType === 'BOOTSTRAP_CLI'
            ? translateApiText(
                'api.labels.administratorBootstrap',
                'Administrator bootstrap command',
              )
            : translateApiText('api.labels.administrator', 'Administrator'),
      },
      target: {
        id: item.targetId,
        type: item.targetType,
        label:
          targetLabelMap.get(`${item.targetType}:${item.targetId}`) ??
          this.getMissingTargetLabel(item.targetType, item.targetId),
      },
    }));
  }

  private getMissingTargetLabel(targetType: string, targetId: string): string {
    if (!Types.ObjectId.isValid(targetId)) return targetId;
    if (targetType === 'AGENT') return translateApiText('api.labels.offlineAgent', 'Offline Agent');
    if (targetType === 'POST') return translateApiText('api.labels.deletedPost', 'Deleted post');
    if (targetType === 'REPLY') return translateApiText('api.labels.deletedReply', 'Deleted reply');
    if (targetType === 'CIRCLE')
      return translateApiText('api.labels.deletedCircle', 'Deleted circle');
    if (targetType === 'CIRCLE_PROPOSAL')
      return translateApiText('api.labels.deletedProposal', 'Deleted proposal');
    if (targetType === 'GOVERNANCE_CASE')
      return translateApiText('api.labels.deletedGovernanceCase', 'Deleted governance case');
    if (targetType === 'CONTENT_REVIEW')
      return translateApiText('api.labels.deletedContentReview', 'Deleted content review');
    if (targetType === 'INVITATION_CODE')
      return translateApiText('api.labels.deletedInvitationCode', 'Deleted invitation code');
    return targetId;
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
        label:
          actor?.username ??
          (item.actorType === 'BOOTSTRAP_CLI'
            ? translateApiText(
                'api.labels.administratorBootstrap',
                'Administrator bootstrap command',
              )
            : translateApiText('api.labels.administrator', 'Administrator')),
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
      return {
        id: targetId,
        type: targetType,
        label: agent?.name ?? translateApiText('api.labels.offlineAgent', 'Offline Agent'),
      };
    }
    if (targetType === 'POST') {
      const post = await this.postModel
        .findOne({ _id: targetId, deletedAt: { $exists: true } })
        .select('title')
        .lean();
      return {
        id: targetId,
        type: targetType,
        label: post?.title ?? translateApiText('api.labels.deletedPost', 'Deleted post'),
      };
    }
    if (targetType === 'REPLY') {
      const reply = await this.replyModel
        .findOne({ _id: targetId, deletedAt: { $exists: true } })
        .select('content')
        .lean();
      const excerpt = reply?.content.replace(/\s+/g, ' ').trim() ?? '';
      return {
        id: targetId,
        type: targetType,
        label: excerpt
          ? excerpt.slice(0, 60)
          : translateApiText('api.labels.deletedReply', 'Deleted reply'),
      };
    }
    if (targetType === 'CIRCLE') {
      const circle = await this.circleModel
        .findOne({ _id: targetId, deletedAt: { $exists: true } })
        .select('name')
        .lean();
      return {
        id: targetId,
        type: targetType,
        label: circle?.name ?? translateApiText('api.labels.deletedCircle', 'Deleted circle'),
      };
    }
    if (targetType === 'CIRCLE_PROPOSAL') {
      const proposal = await this.circleProposalModel.findById(targetId).select('scope').lean();
      return {
        id: targetId,
        type: targetType,
        label:
          proposal?.scope === 'TOPIC'
            ? translateApiText('api.labels.circleTopicProposal', 'Circle topic proposal')
            : proposal
              ? translateApiText('api.labels.circleRulesProposal', 'Circle rules proposal')
              : translateApiText('api.labels.deletedProposal', 'Deleted proposal'),
      };
    }
    if (targetType === 'GOVERNANCE_CASE') {
      const governanceCase = await this.governanceCaseModel
        .findById(targetId)
        .select('targetSnapshot')
        .lean();
      const snapshot = governanceCase?.targetSnapshot;
      const label =
        snapshot?.kind === 'POST' || snapshot?.kind === 'REPLY'
          ? snapshot.post.title
          : snapshot?.kind === 'CIRCLE_PROPOSAL'
            ? snapshot.proposal.scope === 'TOPIC'
              ? translateApiText('api.labels.circleTopicProposalCase', 'Circle topic proposal case')
              : translateApiText('api.labels.circleRulesProposalCase', 'Circle rules proposal case')
            : snapshot
              ? translateApiText(
                  'api.labels.circleProposalCommentCase',
                  'Circle co-build comment case',
                )
              : translateApiText('api.labels.deletedGovernanceCase', 'Deleted governance case');
      return { id: targetId, type: targetType, label };
    }
    if (targetType === 'CONTENT_REVIEW') {
      const review = await this.contentReviewModel.findById(targetId).select('type payload').lean();
      const label =
        review?.type === 'POST' && 'title' in review.payload
          ? review.payload.title
          : review?.type === 'CIRCLE' && 'name' in review.payload
            ? review.payload.name
            : translateApiText('api.labels.deletedContentReview', 'Deleted content review');
      return { id: targetId, type: targetType, label };
    }
    if (targetType === 'INVITATION_CODE') {
      const invitation = await this.invitationCodeModel.findById(targetId).select('prefix').lean();
      return {
        id: targetId,
        type: targetType,
        label: invitation
          ? translateApiText(
              'api.labels.invitationCode',
              `Invitation code ${invitation.prefix}••••••••`,
              { prefix: invitation.prefix },
            )
          : translateApiText('api.labels.deletedInvitationCode', 'Deleted invitation code'),
      };
    }
    return { id: targetId, type: targetType, label: targetId };
  }
}
