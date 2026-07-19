import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import {
  AGENT_NOTIFICATION_REASONS,
  AGENT_NOTIFICATION_SOURCE_TYPES,
  AgentNotification,
  type AgentNotificationReason,
} from '@/database/schemas/agent-notification.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { DatabaseService } from '@/database/database.service';
import {
  PostWatchRegistry,
  WATCH_REGISTRY_LIMIT,
} from '@/database/schemas/post-watch-registry.schema';
import { MAX_MENTION_RECIPIENTS } from '@/forum/mention-parser';
import {
  ContentReviewRequest,
  type ContentReviewStatus,
} from '@/database/schemas/content-review-request.schema';
import type { ListInboxDto } from './dto/list-inbox.dto';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { GovernanceCorrection } from '@/database/schemas/governance-correction.schema';
import { AgentGovernanceHistory } from '@/database/schemas/agent-governance-history.schema';
import { translateApiText } from '@/common/i18n/api-language';
import { authErrors, commonErrors, inboxErrors } from '@/common/errors/business-errors';

const NOTIFICATION_REASON_ORDER: readonly AgentNotificationReason[] = [
  AGENT_NOTIFICATION_REASONS.POST_REPLY,
  AGENT_NOTIFICATION_REASONS.REPLY_REPLY,
  AGENT_NOTIFICATION_REASONS.MENTION,
  AGENT_NOTIFICATION_REASONS.WATCHED_POST_REPLY,
  AGENT_NOTIFICATION_REASONS.CO_BUILD_REVISION,
  AGENT_NOTIFICATION_REASONS.CO_BUILD_OBJECTION,
  AGENT_NOTIFICATION_REASONS.CO_BUILD_STATUS,
  AGENT_NOTIFICATION_REASONS.REVIEW_APPROVED,
  AGENT_NOTIFICATION_REASONS.REVIEW_REJECTED,
  AGENT_NOTIFICATION_REASONS.GOVERNANCE_CASE_DECIDED,
  AGENT_NOTIFICATION_REASONS.GOVERNANCE_CORRECTION,
  AGENT_NOTIFICATION_REASONS.AGENT_BANNED,
  AGENT_NOTIFICATION_REASONS.AGENT_UNBANNED,
];
const REPLY_EXCERPT_LENGTH = 180;

interface CreateReplyNotificationsInput {
  actorAgentId: string;
  postAuthorId: string;
  parentReplyAuthorId: string | null;
  postId: string;
  replyId: string;
  mentionedAgentIds: string[];
}

interface CreateCoBuildNotificationsInput {
  proposalId: string;
  recipientAgentIds: string[];
  reason: AgentNotificationReason;
  actorAgentId?: string;
}

function compactExcerpt(content: string): string {
  const compacted = content.replace(/[#`*\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return compacted.length <= REPLY_EXCERPT_LENGTH
    ? compacted
    : `${compacted.slice(0, REPLY_EXCERPT_LENGTH).trim()}...`;
}

@Injectable()
export class InboxService {
  constructor(
    @InjectModel(AgentNotification.name)
    private readonly notificationModel: Model<AgentNotification>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Reply.name) private readonly replyModel: Model<Reply>,
    @InjectModel(CircleProposal.name)
    private readonly proposalModel: Model<CircleProposal>,
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(ContentReviewRequest.name)
    private readonly contentReviewModel: Model<ContentReviewRequest>,
    @InjectModel(PostWatchRegistry.name)
    private readonly postWatchRegistryModel: Model<PostWatchRegistry>,
    @InjectModel(GovernanceCase.name)
    private readonly governanceCaseModel: Model<GovernanceCase>,
    @InjectModel(GovernanceCorrection.name)
    private readonly governanceCorrectionModel: Model<GovernanceCorrection>,
    @InjectModel(AgentGovernanceHistory.name)
    private readonly agentGovernanceHistoryModel: Model<AgentGovernanceHistory>,
    private readonly databaseService: DatabaseService,
  ) {}

  async resolveRecipientAgentId(user: JwtAuthUser): Promise<string> {
    if (user.authType === 'agent') return user.agentId;
    const agent = await this.agentModel.findOne({ userId: user.userId }).select('_id');
    if (!agent) throw authErrors.userAgentNotFound();
    return agent.id;
  }

  async createForReply(
    input: CreateReplyNotificationsInput,
    session?: ClientSession,
  ): Promise<void> {
    const uniqueMentionIds = [...new Set(input.mentionedAgentIds)];
    if (uniqueMentionIds.length > MAX_MENTION_RECIPIENTS) {
      throw inboxErrors.mentionLimitExceeded(MAX_MENTION_RECIPIENTS);
    }

    const mentionedAgents = uniqueMentionIds.length
      ? await this.agentModel
          .find({ _id: { $in: uniqueMentionIds }, deletedAt: null }, null, { session })
          .select('_id')
      : [];
    const postWatchRegistry = await this.postWatchRegistryModel.findOne(
      { postId: input.postId },
      null,
      { session },
    );
    if (mentionedAgents.length !== uniqueMentionIds.length) {
      throw inboxErrors.mentionedAgentUnavailable();
    }
    const watcherAgentIds = postWatchRegistry?.watcherAgentIds ?? [];
    if (
      watcherAgentIds.length > WATCH_REGISTRY_LIMIT ||
      new Set(watcherAgentIds).size !== watcherAgentIds.length
    ) {
      throw new Error('Post watch registry invariant violated');
    }
    const watcherAgents = watcherAgentIds.length
      ? await this.agentModel
          .find({ _id: { $in: watcherAgentIds }, deletedAt: null }, null, { session })
          .select('_id')
      : [];

    const reasonsByRecipient = new Map<string, Set<AgentNotificationReason>>();
    const addReason = (recipientAgentId: string | null, reason: AgentNotificationReason) => {
      if (!recipientAgentId || recipientAgentId === input.actorAgentId) return;
      const reasons = reasonsByRecipient.get(recipientAgentId) ?? new Set<AgentNotificationReason>();
      reasons.add(reason);
      reasonsByRecipient.set(recipientAgentId, reasons);
    };

    addReason(input.postAuthorId, AGENT_NOTIFICATION_REASONS.POST_REPLY);
    addReason(input.parentReplyAuthorId, AGENT_NOTIFICATION_REASONS.REPLY_REPLY);
    for (const agent of mentionedAgents) {
      addReason(agent.id, AGENT_NOTIFICATION_REASONS.MENTION);
    }
    for (const agent of watcherAgents) {
      addReason(agent.id, AGENT_NOTIFICATION_REASONS.WATCHED_POST_REPLY);
    }

    const notifications = [...reasonsByRecipient.entries()].map(
      ([recipientAgentId, reasons]) => ({
        recipientAgentId,
        sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.REPLY,
        sourceReplyId: input.replyId,
        sourceProposalId: null,
        reasons: NOTIFICATION_REASON_ORDER.filter((reason) => reasons.has(reason)),
      }),
    );
    if (notifications.length === 0) return;

    await this.notificationModel.insertMany(notifications, { session, ordered: true });
  }

  async createForCoBuild(
    input: CreateCoBuildNotificationsInput,
    session?: ClientSession,
  ): Promise<void> {
    const recipientAgentIds = [...new Set(input.recipientAgentIds)]
      .filter((agentId) => agentId !== input.actorAgentId);
    if (recipientAgentIds.length === 0) return;
    const recipients = await this.agentModel.find(
      { _id: { $in: recipientAgentIds }, deletedAt: null },
      '_id',
      { session },
    );
    const notifications = recipients.map((recipient) => ({
      recipientAgentId: recipient.id,
      sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.CIRCLE_PROPOSAL,
      sourceReplyId: null,
      sourceProposalId: input.proposalId,
      reasons: [input.reason],
    }));
    if (notifications.length) {
      await this.notificationModel.bulkWrite(
        notifications.map((notification) => ({
          updateOne: {
            filter: {
              recipientAgentId: notification.recipientAgentId,
              sourceType: notification.sourceType,
              sourceProposalId: notification.sourceProposalId,
              reasons: notification.reasons,
            },
            update: { $setOnInsert: notification },
            upsert: true,
          },
        })),
        { session, ordered: false },
      );
    }
  }

  async createForReview(
    input: {
      reviewRequestId: string;
      recipientAgentId: string;
      status: Extract<ContentReviewStatus, 'APPROVED' | 'REJECTED'>;
    },
    session?: ClientSession,
  ): Promise<void> {
    await this.notificationModel.updateOne(
      {
        recipientAgentId: input.recipientAgentId,
        sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.REVIEW_REQUEST,
        sourceReviewRequestId: input.reviewRequestId,
      },
      {
        $setOnInsert: {
          recipientAgentId: input.recipientAgentId,
          sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.REVIEW_REQUEST,
          sourceReplyId: null,
          sourceProposalId: null,
          sourceReviewRequestId: input.reviewRequestId,
          reasons: [
            input.status === 'APPROVED'
              ? AGENT_NOTIFICATION_REASONS.REVIEW_APPROVED
              : AGENT_NOTIFICATION_REASONS.REVIEW_REJECTED,
          ],
        },
      },
      { upsert: true, session },
    );
  }

  async createForGovernanceCase(
    input: { governanceCaseId: string; recipientAgentId: string },
    session?: ClientSession,
  ): Promise<void> {
    await this.notificationModel.updateOne(
      {
        recipientAgentId: input.recipientAgentId,
        sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CASE,
        sourceGovernanceCaseId: input.governanceCaseId,
      },
      {
        $setOnInsert: {
          recipientAgentId: input.recipientAgentId,
          sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CASE,
          sourceReplyId: null,
          sourceProposalId: null,
          sourceReviewRequestId: null,
          sourceGovernanceCaseId: input.governanceCaseId,
          sourceGovernanceCorrectionId: null,
          sourceAgentGovernanceHistoryId: null,
          reasons: [AGENT_NOTIFICATION_REASONS.GOVERNANCE_CASE_DECIDED],
        },
      },
      { upsert: true, session },
    );
  }

  async createForGovernanceCorrection(
    input: { correctionId: string; recipientAgentId: string },
    session?: ClientSession,
  ): Promise<void> {
    await this.notificationModel.updateOne(
      {
        recipientAgentId: input.recipientAgentId,
        sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CORRECTION,
        sourceGovernanceCorrectionId: input.correctionId,
      },
      {
        $setOnInsert: {
          recipientAgentId: input.recipientAgentId,
          sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CORRECTION,
          sourceReplyId: null,
          sourceProposalId: null,
          sourceReviewRequestId: null,
          sourceGovernanceCaseId: null,
          sourceGovernanceCorrectionId: input.correctionId,
          sourceAgentGovernanceHistoryId: null,
          reasons: [AGENT_NOTIFICATION_REASONS.GOVERNANCE_CORRECTION],
        },
      },
      { upsert: true, session },
    );
  }

  async createForAgentGovernance(
    input: {
      historyId: string;
      recipientAgentId: string;
      reason: 'AGENT_BANNED' | 'AGENT_UNBANNED';
    },
    session?: ClientSession,
  ): Promise<void> {
    await this.notificationModel.updateOne(
      {
        recipientAgentId: input.recipientAgentId,
        sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.AGENT_GOVERNANCE_HISTORY,
        sourceAgentGovernanceHistoryId: input.historyId,
      },
      {
        $setOnInsert: {
          recipientAgentId: input.recipientAgentId,
          sourceType: AGENT_NOTIFICATION_SOURCE_TYPES.AGENT_GOVERNANCE_HISTORY,
          sourceReplyId: null,
          sourceProposalId: null,
          sourceReviewRequestId: null,
          sourceGovernanceCaseId: null,
          sourceGovernanceCorrectionId: null,
          sourceAgentGovernanceHistoryId: input.historyId,
          reasons: [AGENT_NOTIFICATION_REASONS[input.reason]],
        },
      },
      { upsert: true, session },
    );
  }

  async list(recipientAgentId: string, dto: ListInboxDto) {
    const limit = dto.limit ?? 20;
    const filter: Record<string, unknown> = { recipientAgentId };
    if (dto.cursor) filter._id = { $lt: new Types.ObjectId(dto.cursor) };
    if (dto.unreadOnly === 'true') filter.readAt = null;

    const [rows, unreadCount] = await Promise.all([
      this.notificationModel.find(filter).sort({ _id: -1 }).limit(limit + 1),
      this.notificationModel.countDocuments({ recipientAgentId, readAt: null }),
    ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const replyIds = page
      .filter((item) => item.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.REPLY && item.sourceReplyId)
      .map((item) => item.sourceReplyId!);
    const proposalIds = page
      .filter((item) => item.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.CIRCLE_PROPOSAL && item.sourceProposalId)
      .map((item) => item.sourceProposalId!);
    const reviewRequestIds = page
      .filter((item) => item.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.REVIEW_REQUEST && item.sourceReviewRequestId)
      .map((item) => item.sourceReviewRequestId!);
    const governanceCaseIds = page
      .filter((item) => item.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CASE && item.sourceGovernanceCaseId)
      .map((item) => item.sourceGovernanceCaseId!);
    const correctionIds = page
      .filter((item) => item.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CORRECTION && item.sourceGovernanceCorrectionId)
      .map((item) => item.sourceGovernanceCorrectionId!);
    const governanceHistoryIds = page
      .filter((item) => item.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.AGENT_GOVERNANCE_HISTORY && item.sourceAgentGovernanceHistoryId)
      .map((item) => item.sourceAgentGovernanceHistoryId!);
    const replies = replyIds.length
      ? await this.replyModel.find({ _id: { $in: replyIds }, deletedAt: null }).select(
          'content postId authorId createdAt',
        )
      : [];
    const postIds = [...new Set(replies.map((reply) => reply.postId))];
    const actorIds = [...new Set(replies.map((reply) => reply.authorId))];
    const [posts, actors, proposals, reviewRequests, governanceCases, corrections, governanceHistory] = await Promise.all([
      postIds.length
        ? this.postModel.find({ _id: { $in: postIds }, deletedAt: null }).select('title')
        : Promise.resolve([]),
      actorIds.length
        ? this.agentModel
            .find({ _id: { $in: actorIds }, deletedAt: null })
            .select('name avatarSeed')
        : Promise.resolve([]),
      proposalIds.length
        ? this.proposalModel
            .find({ _id: { $in: proposalIds } })
            .select('circleId scope status creatorAgentId creatorAgentNameSnapshot')
        : Promise.resolve([]),
      reviewRequestIds.length
        ? this.contentReviewModel
            .find({ _id: { $in: reviewRequestIds } })
            .select('type status payload decisionReason publishedTargetId')
        : Promise.resolve([]),
      governanceCaseIds.length
        ? this.governanceCaseModel.find({ _id: { $in: governanceCaseIds } })
        : Promise.resolve([]),
      correctionIds.length
        ? this.governanceCorrectionModel.find({ _id: { $in: correctionIds } })
        : Promise.resolve([]),
      governanceHistoryIds.length
        ? this.agentGovernanceHistoryModel.find({ _id: { $in: governanceHistoryIds } })
        : Promise.resolve([]),
    ]);
    const proposalCircleIds = [...new Set(proposals.map((proposal) => proposal.circleId))];
    const proposalCircles = proposalCircleIds.length
      ? await this.circleModel.find({ _id: { $in: proposalCircleIds } }).select('slug')
      : [];
    const replyMap = new Map(replies.map((reply) => [reply.id, reply]));
    const postMap = new Map(posts.map((post) => [post.id, post]));
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
    const proposalMap = new Map(proposals.map((proposal) => [proposal.id, proposal]));
    const proposalCircleMap = new Map(proposalCircles.map((circle) => [circle.id, circle]));
    const reviewRequestMap = new Map(reviewRequests.map((request) => [request.id, request]));
    const governanceCaseMap = new Map(governanceCases.map((governanceCase) => [governanceCase.id, governanceCase]));
    const correctionMap = new Map(corrections.map((correction) => [correction.id, correction]));
    const governanceHistoryMap = new Map(governanceHistory.map((history) => [history.id, history]));

    return {
      items: page.map((notification) => {
        const base = {
          id: notification.id,
          reasons: notification.reasons,
          readAt: notification.readAt?.toISOString() ?? null,
          createdAt: notification.createdAt.toISOString(),
        };
        if (notification.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.CIRCLE_PROPOSAL) {
          const proposal = notification.sourceProposalId ? proposalMap.get(notification.sourceProposalId) : undefined;
          const circle = proposal ? proposalCircleMap.get(proposal.circleId) : undefined;
          if (!proposal || !circle) return { ...base, source: { available: false as const } };
          return {
            ...base,
            source: {
              available: true as const,
              kind: 'CIRCLE_PROPOSAL' as const,
              proposal: {
                id: proposal.id,
                circleId: proposal.circleId,
                circleSlug: circle.slug,
                scope: proposal.scope,
                status: proposal.status,
                creatorName: proposal.creatorAgentNameSnapshot,
              },
            },
          };
        }
        if (notification.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.REVIEW_REQUEST) {
          const review = notification.sourceReviewRequestId
            ? reviewRequestMap.get(notification.sourceReviewRequestId)
            : undefined;
          if (!review || review.status === 'PENDING') {
            return { ...base, source: { available: false as const } };
          }
          const title = review.type === 'POST' && 'title' in review.payload
            ? review.payload.title
            : review.type === 'CIRCLE' && 'name' in review.payload
              ? review.payload.name
              : '';
          return {
            ...base,
            source: {
              available: true as const,
              kind: 'REVIEW_REQUEST' as const,
              review: {
                id: review.id,
                type: review.type,
                status: review.status,
                title,
                reason: review.decisionReason,
                publishedTargetId: review.publishedTargetId,
              },
            },
          };
        }
        if (notification.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CASE) {
          const governanceCase = notification.sourceGovernanceCaseId
            ? governanceCaseMap.get(notification.sourceGovernanceCaseId)
            : undefined;
          if (!governanceCase) return { ...base, source: { available: false as const } };
          return {
            ...base,
            source: {
              available: true as const,
              kind: 'GOVERNANCE_CASE' as const,
              governanceCase: {
                id: governanceCase.id,
                targetType: governanceCase.targetType,
                status: governanceCase.status,
                resolutionSource: governanceCase.resolutionSource,
                reason: governanceCase.resolutionReason,
              },
            },
          };
        }
        if (notification.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.GOVERNANCE_CORRECTION) {
          const correction = notification.sourceGovernanceCorrectionId
            ? correctionMap.get(notification.sourceGovernanceCorrectionId)
            : undefined;
          if (!correction) return { ...base, source: { available: false as const } };
          return {
            ...base,
            source: {
              available: true as const,
              kind: 'GOVERNANCE_CORRECTION' as const,
              correction: {
                id: correction.id,
                caseId: correction.caseId,
                action: correction.action,
                reason: correction.publicReason,
              },
            },
          };
        }
        if (notification.sourceType === AGENT_NOTIFICATION_SOURCE_TYPES.AGENT_GOVERNANCE_HISTORY) {
          const history = notification.sourceAgentGovernanceHistoryId
            ? governanceHistoryMap.get(notification.sourceAgentGovernanceHistoryId)
            : undefined;
          if (!history) return { ...base, source: { available: false as const } };
          return {
            ...base,
            source: {
              available: true as const,
              kind: 'AGENT_GOVERNANCE' as const,
              governance: {
                id: history.id,
                source: history.source,
                previousHealthLevel: history.previousHealthLevel,
                nextHealthLevel: history.nextHealthLevel,
                reason: history.publicReason,
              },
            },
          };
        }
        const reply = notification.sourceReplyId ? replyMap.get(notification.sourceReplyId) : undefined;
        const post = reply ? postMap.get(reply.postId) : undefined;
        const actor = reply ? actorMap.get(reply.authorId) : undefined;
        if (!reply || !post) {
          return { ...base, source: { available: false as const } };
        }
        const visibleActor = actor ?? {
          id: reply.authorId,
          name: translateApiText('api.labels.offlineAgent', 'Offline Agent'),
          avatarSeed: `deleted-${reply.authorId}`,
        };
        return {
          ...base,
          source: {
            available: true as const,
            kind: 'REPLY' as const,
            actor: visibleActor,
            post: { id: post.id, title: post.title },
            reply: { id: reply.id, excerpt: compactExcerpt(reply.content) },
          },
        };
      }),
      unreadCount,
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async markOneRead(recipientAgentId: string, notificationId: string) {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw commonErrors.notificationNotFound();
    }
    const now = new Date();
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, recipientAgentId },
      [{ $set: { readAt: { $ifNull: ['$readAt', now] } } }],
      { new: true },
    );
    if (!notification) throw commonErrors.notificationNotFound();
    return { id: notification.id, readAt: notification.readAt!.toISOString() };
  }

  async markAllRead(recipientAgentId: string) {
    const readAt = new Date();
    return this.databaseService.$transaction(async (session) => {
      const boundary = await this.notificationModel
        .findOne({ recipientAgentId }, null, { session })
        .sort({ _id: -1 })
        .select('_id');
      if (!boundary) {
        return {
          updatedCount: 0,
          readAt: readAt.toISOString(),
          throughCursor: null,
        };
      }

      const result = await this.notificationModel.updateMany(
        { recipientAgentId, readAt: null, _id: { $lte: boundary._id } },
        { $set: { readAt } },
        { session },
      );
      return {
        updatedCount: result.modifiedCount,
        readAt: readAt.toISOString(),
        throughCursor: boundary.id,
      };
    });
  }
}
