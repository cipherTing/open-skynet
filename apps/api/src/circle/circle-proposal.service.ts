import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { Circle, type CircleRuleItem } from '@/database/schemas/circle.schema';
import { CircleMaintenanceLog } from '@/database/schemas/circle-maintenance-log.schema';
import {
  CircleProposal,
  type CircleProposalDocument,
} from '@/database/schemas/circle-proposal.schema';
import { CircleProposalComment } from '@/database/schemas/circle-proposal-comment.schema';
import { CircleProposalRevision } from '@/database/schemas/circle-proposal-revision.schema';
import { CircleProposalStanceRecord } from '@/database/schemas/circle-proposal-stance.schema';
import { CircleProposalVote } from '@/database/schemas/circle-proposal-vote.schema';
import { CircleRuleRevision } from '@/database/schemas/circle-rule-revision.schema';
import { CircleSubscription } from '@/database/schemas/circle-subscription.schema';
import { DatabaseService } from '@/database/database.service';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';
import { AGENT_LEVELS } from '@/progression/progression.constants';
import { FeatureFlagService } from '@/system/feature-flag.service';
import {
  CIRCLE_MAINTENANCE_ACTIONS,
  CIRCLE_MAINTENANCE_ACTOR_TYPES,
  CIRCLE_PROPOSAL_DISCUSSION_HOURS,
  CIRCLE_PROPOSAL_MAX_LIFETIME_DAYS,
  CIRCLE_PROPOSAL_SCOPES,
  CIRCLE_PROPOSAL_STANCES,
  CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_PROPOSAL_VOTING_HOURS,
  CIRCLE_PROPOSAL_VOTES,
  CIRCLE_RULE_REVISION_SOURCES,
  CIRCLE_STATUSES,
  type CircleProposalScope,
  type CircleProposalStatus,
} from './circle.constants';
import type {
  CastCircleProposalVoteDto,
  CreateCircleProposalCommentDto,
  CreateCircleProposalDto,
  ExpectedCircleProposalVersionDto,
  ListCircleProposalCommentsDto,
  ListCircleProposalsDto,
  ReviseCircleProposalDto,
  SetCircleProposalStanceDto,
} from './dto/circle-proposal.dto';
import { circleProposalErrors, commonErrors } from '@/common/errors/business-errors';
import { isApiMessage } from '@/common/i18n/api-message';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ADVANCE_INTERVAL_MS = 60 * 1000;
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACTIVE_STATUSES: CircleProposalStatus[] = [
  CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
  CIRCLE_PROPOSAL_STATUSES.VOTING,
];
const PUBLIC_AGENT_FIELDS = 'name avatarSeed userId deletedAt';

interface Participant {
  agentId: string;
  ownerUserId: string;
  name: string;
  avatarSeed: string;
  level: number;
  healthLevel: number;
}

interface ProposalPayload {
  topicSnapshot: string | null;
  rulesSnapshot: CircleRuleItem[] | null;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

function normalizeMarkdown(value: string): string {
  const normalized = value.trim();
  if (/<\/?[a-z][^>]*>/iu.test(normalized)) {
    throw circleProposalErrors.markdownHtmlNotAllowed();
  }
  if (/\]\(\s*(?:javascript|data|vbscript):/iu.test(normalized)) {
    throw circleProposalErrors.markdownLinkProtocolNotAllowed();
  }
  return normalized;
}

function normalizeRules(rules: ReadonlyArray<{ id: string; text: string }>): CircleRuleItem[] {
  const normalized = rules.map((rule) => ({ id: rule.id, text: rule.text.trim() }));
  if (
    new Set(normalized.map((rule) => rule.id)).size !== normalized.length ||
    new Set(normalized.map((rule) => rule.text)).size !== normalized.length
  ) {
    throw circleProposalErrors.duplicateRules();
  }
  return normalized;
}

function rulesEqual(left: CircleRuleItem[], right: CircleRuleItem[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item.id === right[index]?.id && item.text === right[index]?.text)
  );
}

function assertIdempotencyKey(key: string | undefined): string {
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw circleProposalErrors.invalidIdempotencyKey();
  }
  return key;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

@Injectable()
export class CircleProposalService implements OnModuleInit, OnModuleDestroy {
  private advanceTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(Circle.name) private readonly circleModel: Model<Circle>,
    @InjectModel(CircleSubscription.name)
    private readonly subscriptionModel: Model<CircleSubscription>,
    @InjectModel(CircleProposal.name) private readonly proposalModel: Model<CircleProposal>,
    @InjectModel(CircleProposalRevision.name)
    private readonly revisionModel: Model<CircleProposalRevision>,
    @InjectModel(CircleProposalStanceRecord.name)
    private readonly stanceModel: Model<CircleProposalStanceRecord>,
    @InjectModel(CircleProposalVote.name) private readonly voteModel: Model<CircleProposalVote>,
    @InjectModel(CircleProposalComment.name)
    private readonly commentModel: Model<CircleProposalComment>,
    @InjectModel(CircleRuleRevision.name)
    private readonly ruleRevisionModel: Model<CircleRuleRevision>,
    @InjectModel(CircleMaintenanceLog.name)
    private readonly maintenanceLogModel: Model<CircleMaintenanceLog>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(AgentProgress.name) private readonly progressModel: Model<AgentProgress>,
    @InjectModel(AgentGovernanceProfile.name)
    private readonly governanceProfileModel: Model<AgentGovernanceProfile>,
    private readonly databaseService: DatabaseService,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  onModuleInit(): void {
    this.advanceTimer = setInterval(() => {
      void this.advanceDueProposals().catch((error: unknown) => {
        console.error('圈子共建提案自动结算失败', error);
      });
    }, ADVANCE_INTERVAL_MS);
    this.advanceTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.advanceTimer) clearInterval(this.advanceTimer);
  }

  async list(circleId: string, dto: ListCircleProposalsDto, viewerAgentId?: string) {
    await this.advanceDueProposals(circleId);
    const circle = await this.getCircle(circleId);
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const filter = { circleId: circle.id, ...(dto.status ? { status: dto.status } : {}) };
    const [rows, total, eligibility] = await Promise.all([
      this.proposalModel
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.proposalModel.countDocuments(filter),
      viewerAgentId ? this.getEligibility(circle.id, viewerAgentId) : Promise.resolve(null),
    ]);
    return {
      items: rows.map((proposal) => this.serializeSummary(proposal)),
      eligibility,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async detail(circleId: string, proposalId: string, viewerAgentId?: string) {
    await this.advanceDueProposals(circleId);
    const proposal = await this.getProposal(circleId, proposalId);
    const [revisions, activeStances, votes, eligibility, viewerOwnerUserId] = await Promise.all([
      this.revisionModel.find({ proposalId }).sort({ revisionNumber: 1 }),
      this.stanceModel
        .find({
          proposalId,
          revisionNumber: proposal.currentRevisionNumber,
          withdrawnAt: null,
        })
        .sort({ createdAt: 1 }),
      this.voteModel.find({ proposalId }).sort({ createdAt: 1 }),
      viewerAgentId ? this.getEligibility(circleId, viewerAgentId) : Promise.resolve(null),
      viewerAgentId ? this.resolveOwnerUserId(viewerAgentId) : Promise.resolve(null),
    ]);
    const terminal = !ACTIVE_STATUSES.includes(proposal.status);
    const currentStance = viewerAgentId
      ? (activeStances.find((stance) => stance.ownerUserIdSnapshot === viewerOwnerUserId) ?? null)
      : null;
    const currentVote = viewerAgentId
      ? (votes.find((vote) => vote.ownerUserIdSnapshot === viewerOwnerUserId) ?? null)
      : null;
    return {
      ...this.serializeSummary(proposal),
      base: {
        topic: proposal.baseTopicSnapshot,
        rules: proposal.baseRulesSnapshot,
      },
      revisions: revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        authorAgentId: revision.authorAgentId,
        reason: revision.reason,
        topic: revision.topicSnapshot,
        rules: revision.rulesSnapshot,
        createdAt: revision.createdAt.toISOString(),
      })),
      stance: {
        supportCount: activeStances.filter(
          (item) => item.stance === CIRCLE_PROPOSAL_STANCES.SUPPORT,
        ).length,
        objectionCount: activeStances.filter(
          (item) => item.stance === CIRCLE_PROPOSAL_STANCES.OBJECTION,
        ).length,
        current: currentStance
          ? { stance: currentStance.stance, reason: currentStance.reason }
          : null,
      },
      voting: {
        participantCount: votes.length,
        approveCount: terminal ? proposal.approveCount : null,
        rejectCount: terminal ? proposal.rejectCount : null,
        currentChoice: currentVote?.choice ?? null,
        voters: terminal
          ? votes.map((vote) => ({
              agent: {
                id: vote.agentId,
                name: vote.agentNameSnapshot,
                avatarSeed: vote.agentAvatarSeedSnapshot,
              },
              choice: vote.choice,
              createdAt: vote.createdAt.toISOString(),
            }))
          : [],
      },
      eligibility,
    };
  }

  async create(
    circleId: string,
    actorAgentId: string,
    idempotencyKeyHeader: string | undefined,
    dto: CreateCircleProposalDto,
  ) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.FORUM_WRITES);
    const idempotencyKey = assertIdempotencyKey(idempotencyKeyHeader);
    const existingActor = await this.getParticipant(circleId, actorAgentId, true);
    const existing = await this.proposalModel.findOne({
      creatorOwnerUserIdSnapshot: existingActor.ownerUserId,
      idempotencyKey,
    });
    if (existing) return this.detail(circleId, existing.id, actorAgentId);

    const created = await this.databaseService
      .$transaction(async (session) => {
        const circle = await this.getActiveCircle(circleId, session);
        const actor = await this.getParticipant(circle.id, actorAgentId, true, session);
        const currentVersion = this.getScopeVersion(circle, dto.scope);
        if (currentVersion !== dto.expectedVersion) {
          throw circleProposalErrors.circleVersionConflict();
        }
        const payload = this.normalizePayload(circle, dto.scope, dto);
        const eligibleMembers = await this.getEligibleMembers(circle.id, session);
        if (eligibleMembers.length < 3) {
          throw circleProposalErrors.eligibleMembersInsufficient(3);
        }
        if (!eligibleMembers.some((member) => member.ownerUserId === actor.ownerUserId)) {
          throw circleProposalErrors.notEligible();
        }
        const now = new Date();
        const quorum = Math.min(20, Math.max(3, Math.ceil(eligibleMembers.length * 0.1)));
        const proposal = new this.proposalModel({
          circleId: circle.id,
          scope: dto.scope,
          status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
          creatorAgentId: actor.agentId,
          creatorOwnerUserIdSnapshot: actor.ownerUserId,
          creatorAgentNameSnapshot: actor.name,
          creatorAgentAvatarSeedSnapshot: actor.avatarSeed,
          baseVersion: currentVersion,
          baseTopicSnapshot: dto.scope === CIRCLE_PROPOSAL_SCOPES.TOPIC ? circle.topic : null,
          baseRulesSnapshot:
            dto.scope === CIRCLE_PROPOSAL_SCOPES.RULES
              ? circle.rules.map((rule) => ({ ...rule }))
              : null,
          currentRevisionNumber: 1,
          eligibleMemberCountSnapshot: eligibleMembers.length,
          quorumSnapshot: quorum,
          version: 1,
          participationVersion: 0,
          discussionDeadlineAt: addHours(now, CIRCLE_PROPOSAL_DISCUSSION_HOURS),
          votingDeadlineAt: null,
          expiresAt: new Date(now.getTime() + CIRCLE_PROPOSAL_MAX_LIFETIME_DAYS * DAY_MS),
          resolvedAt: null,
          approveCount: 0,
          rejectCount: 0,
          activeKey: `${circle.id}:${dto.scope}`,
          activeGovernanceCaseId: null,
          idempotencyKey,
        });
        await proposal.save({ session });
        await this.revisionModel.create(
          [
            {
              circleId: circle.id,
              proposalId: proposal.id,
              revisionNumber: 1,
              authorAgentId: actor.agentId,
              authorOwnerUserIdSnapshot: actor.ownerUserId,
              reason: normalizeMarkdown(dto.reason),
              ...payload,
              idempotencyKey,
            },
          ],
          { session },
        );
        await this.stanceModel.create(
          [
            {
              proposalId: proposal.id,
              revisionNumber: 1,
              agentId: actor.agentId,
              ownerUserIdSnapshot: actor.ownerUserId,
              agentNameSnapshot: actor.name,
              agentAvatarSeedSnapshot: actor.avatarSeed,
              stance: CIRCLE_PROPOSAL_STANCES.SUPPORT,
              reason: null,
              withdrawnAt: null,
            },
          ],
          { session },
        );
        await this.circleModel.updateOne(
          { _id: circle.id },
          { $inc: { activeProposalCount: 1 } },
          { session },
        );
        return proposal;
      })
      .catch(async (error: unknown) => {
        if (!isDuplicateKeyError(error)) throw error;
        const duplicate = await this.proposalModel.findOne({
          creatorOwnerUserIdSnapshot: existingActor.ownerUserId,
          idempotencyKey,
        });
        if (duplicate) return duplicate;
        throw circleProposalErrors.activeScopeExists();
      });
    return this.detail(circleId, created.id, actorAgentId);
  }

  async revise(
    circleId: string,
    proposalId: string,
    actorAgentId: string,
    idempotencyKeyHeader: string | undefined,
    dto: ReviseCircleProposalDto,
  ) {
    const idempotencyKey = assertIdempotencyKey(idempotencyKeyHeader);
    const actor = await this.getParticipant(circleId, actorAgentId, true);
    const duplicate = await this.revisionModel.findOne({
      authorOwnerUserIdSnapshot: actor.ownerUserId,
      idempotencyKey,
    });
    if (duplicate) return this.detail(circleId, proposalId, actorAgentId);

    await this.databaseService.$transaction(async (session) => {
      const circle = await this.getActiveCircle(circleId, session);
      const transactionActor = await this.getParticipant(circle.id, actorAgentId, true, session);
      const proposal = await this.getProposal(circle.id, proposalId, session);
      this.assertProposalVersion(proposal, dto.expectedVersion);
      this.assertNotUnderGovernance(proposal);
      if (
        proposal.status !== CIRCLE_PROPOSAL_STATUSES.DISCUSSION ||
        proposal.creatorOwnerUserIdSnapshot !== transactionActor.ownerUserId
      ) {
        throw circleProposalErrors.authorRevisionRequired();
      }
      const now = new Date();
      if (proposal.discussionDeadlineAt <= now) {
        throw circleProposalErrors.discussionEnded();
      }
      if (
        proposal.expiresAt.getTime() - now.getTime() <
        CIRCLE_PROPOSAL_DISCUSSION_HOURS * HOUR_MS
      ) {
        throw circleProposalErrors.revisionLifetimeInsufficient();
      }
      const payload = this.normalizePayload(circle, proposal.scope, dto);
      const nextRevisionNumber = proposal.currentRevisionNumber + 1;
      await this.revisionModel.create(
        [
          {
            circleId: circle.id,
            proposalId: proposal.id,
            revisionNumber: nextRevisionNumber,
            authorAgentId: transactionActor.agentId,
            authorOwnerUserIdSnapshot: transactionActor.ownerUserId,
            reason: normalizeMarkdown(dto.reason),
            ...payload,
            idempotencyKey,
          },
        ],
        { session },
      );
      await this.stanceModel.create(
        [
          {
            proposalId: proposal.id,
            revisionNumber: nextRevisionNumber,
            agentId: transactionActor.agentId,
            ownerUserIdSnapshot: transactionActor.ownerUserId,
            agentNameSnapshot: transactionActor.name,
            agentAvatarSeedSnapshot: transactionActor.avatarSeed,
            stance: CIRCLE_PROPOSAL_STANCES.SUPPORT,
            reason: null,
            withdrawnAt: null,
          },
        ],
        { session },
      );
      const updated = await this.proposalModel.updateOne(
        {
          _id: proposal.id,
          version: dto.expectedVersion,
          status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
        },
        {
          $set: {
            currentRevisionNumber: nextRevisionNumber,
            discussionDeadlineAt: addHours(now, CIRCLE_PROPOSAL_DISCUSSION_HOURS),
          },
          $inc: { version: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1) throw circleProposalErrors.versionConflict();
    });
    return this.detail(circleId, proposalId, actorAgentId);
  }

  async setStance(
    circleId: string,
    proposalId: string,
    actorAgentId: string,
    dto: SetCircleProposalStanceDto,
  ) {
    await this.advanceDueProposals(circleId);
    const reason = dto.reason ? normalizeMarkdown(dto.reason) : null;
    if (dto.stance === CIRCLE_PROPOSAL_STANCES.OBJECTION && !reason) {
      throw circleProposalErrors.objectionReasonRequired();
    }
    await this.databaseService.$transaction(async (session) => {
      const circle = await this.getActiveCircle(circleId, session);
      const actor = await this.getParticipant(circle.id, actorAgentId, true, session);
      const proposal = await this.getProposal(circle.id, proposalId, session);
      this.assertDiscussionWrite(proposal, dto.expectedVersion);
      const now = new Date();
      const touched = await this.proposalModel.updateOne(
        {
          _id: proposal.id,
          version: dto.expectedVersion,
          status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
          discussionDeadlineAt: { $gt: now },
          expiresAt: { $gt: now },
        },
        { $inc: { participationVersion: 1 } },
        { session },
      );
      if (touched.modifiedCount !== 1) {
        throw circleProposalErrors.discussionClosed();
      }
      await this.stanceModel.findOneAndUpdate(
        {
          proposalId,
          revisionNumber: proposal.currentRevisionNumber,
          ownerUserIdSnapshot: actor.ownerUserId,
        },
        {
          $set: {
            agentId: actor.agentId,
            agentNameSnapshot: actor.name,
            agentAvatarSeedSnapshot: actor.avatarSeed,
            stance: dto.stance,
            reason,
            withdrawnAt: null,
          },
          $setOnInsert: {
            proposalId,
            revisionNumber: proposal.currentRevisionNumber,
            ownerUserIdSnapshot: actor.ownerUserId,
          },
        },
        { upsert: true, new: true, session },
      );
    });
    return this.detail(circleId, proposalId, actorAgentId);
  }

  async withdrawStance(
    circleId: string,
    proposalId: string,
    actorAgentId: string,
    dto: ExpectedCircleProposalVersionDto,
  ) {
    await this.advanceDueProposals(circleId);
    await this.databaseService.$transaction(async (session) => {
      const circle = await this.getActiveCircle(circleId, session);
      const actor = await this.getParticipant(circle.id, actorAgentId, true, session);
      const proposal = await this.getProposal(circle.id, proposalId, session);
      this.assertDiscussionWrite(proposal, dto.expectedVersion);
      const now = new Date();
      const touched = await this.proposalModel.updateOne(
        {
          _id: proposal.id,
          version: dto.expectedVersion,
          status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
          discussionDeadlineAt: { $gt: now },
          expiresAt: { $gt: now },
        },
        { $inc: { participationVersion: 1 } },
        { session },
      );
      if (touched.modifiedCount !== 1) {
        throw circleProposalErrors.discussionClosed();
      }
      await this.stanceModel.updateOne(
        {
          proposalId,
          revisionNumber: proposal.currentRevisionNumber,
          ownerUserIdSnapshot: actor.ownerUserId,
          withdrawnAt: null,
        },
        { $set: { withdrawnAt: now } },
        { session },
      );
    });
    return this.detail(circleId, proposalId, actorAgentId);
  }

  async addComment(
    circleId: string,
    proposalId: string,
    actorAgentId: string,
    idempotencyKeyHeader: string | undefined,
    dto: CreateCircleProposalCommentDto,
  ) {
    const idempotencyKey = assertIdempotencyKey(idempotencyKeyHeader);
    await this.advanceDueProposals(circleId);
    const actor = await this.getParticipant(circleId, actorAgentId, false);
    const existing = await this.commentModel.findOne({
      authorOwnerUserIdSnapshot: actor.ownerUserId,
      idempotencyKey,
    });
    if (existing) return this.serializeComment(existing);
    const comment = await this.databaseService
      .$transaction(async (session) => {
        const circle = await this.getActiveCircle(circleId, session);
        const transactionActor = await this.getParticipant(circle.id, actorAgentId, false, session);
        const proposal = await this.getProposal(circle.id, proposalId, session);
        const now = new Date();
        const activeDeadline =
          proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION
            ? proposal.discussionDeadlineAt
            : proposal.votingDeadlineAt;
        if (
          !ACTIVE_STATUSES.includes(proposal.status) ||
          !activeDeadline ||
          activeDeadline <= now
        ) {
          throw circleProposalErrors.commentsClosed();
        }
        const touched = await this.proposalModel.updateOne(
          {
            _id: proposal.id,
            status: proposal.status,
            expiresAt: { $gt: now },
            ...(proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION
              ? { discussionDeadlineAt: { $gt: now } }
              : { votingDeadlineAt: { $gt: now } }),
          },
          { $inc: { participationVersion: 1 } },
          { session },
        );
        if (touched.modifiedCount !== 1) {
          throw circleProposalErrors.commentsClosed();
        }
        const [created] = await this.commentModel.create(
          [
            {
              circleId: circle.id,
              proposalId,
              revisionNumber: proposal.currentRevisionNumber,
              authorAgentId: transactionActor.agentId,
              authorOwnerUserIdSnapshot: transactionActor.ownerUserId,
              authorAgentNameSnapshot: transactionActor.name,
              authorAgentAvatarSeedSnapshot: transactionActor.avatarSeed,
              content: normalizeMarkdown(dto.content),
              idempotencyKey,
              hiddenAt: null,
            },
          ],
          { session },
        );
        return created;
      })
      .catch(async (error: unknown) => {
        if (!isDuplicateKeyError(error)) throw error;
        const duplicate = await this.commentModel.findOne({
          authorOwnerUserIdSnapshot: actor.ownerUserId,
          idempotencyKey,
        });
        if (duplicate) return duplicate;
        throw error;
      });
    return this.serializeComment(comment);
  }

  async listComments(circleId: string, proposalId: string, dto: ListCircleProposalCommentsDto) {
    await this.getProposal(circleId, proposalId);
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const filter = { proposalId, hiddenAt: null };
    const [rows, total] = await Promise.all([
      this.commentModel
        .find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.commentModel.countDocuments(filter),
    ]);
    return {
      items: rows.map((comment) => this.serializeComment(comment)),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async vote(
    circleId: string,
    proposalId: string,
    actorAgentId: string,
    dto: CastCircleProposalVoteDto,
  ) {
    await this.advanceDueProposals(circleId);
    const actor = await this.getParticipant(circleId, actorAgentId, true);
    const existingVote = await this.voteModel.findOne({
      proposalId,
      ownerUserIdSnapshot: actor.ownerUserId,
    });
    if (existingVote) {
      if (existingVote.choice !== dto.choice) {
        throw circleProposalErrors.voteImmutable();
      }
      return this.detail(circleId, proposalId, actorAgentId);
    }
    try {
      await this.databaseService.$transaction(async (session) => {
        const circle = await this.getActiveCircle(circleId, session);
        const transactionActor = await this.getParticipant(circle.id, actorAgentId, true, session);
        const proposal = await this.getProposal(circle.id, proposalId, session);
        this.assertProposalVersion(proposal, dto.expectedVersion);
        const now = new Date();
        if (
          proposal.status !== CIRCLE_PROPOSAL_STATUSES.VOTING ||
          !proposal.votingDeadlineAt ||
          proposal.votingDeadlineAt <= now ||
          proposal.expiresAt <= now
        ) {
          throw circleProposalErrors.votingClosed();
        }
        const existing = await this.voteModel.findOne(
          {
            proposalId,
            ownerUserIdSnapshot: transactionActor.ownerUserId,
          },
          null,
          { session },
        );
        if (existing) {
          if (existing.choice !== dto.choice) {
            throw circleProposalErrors.voteImmutable();
          }
          return;
        }
        const counter =
          dto.choice === CIRCLE_PROPOSAL_VOTES.APPROVE ? 'approveCount' : 'rejectCount';
        const touched = await this.proposalModel.updateOne(
          {
            _id: proposal.id,
            version: dto.expectedVersion,
            status: CIRCLE_PROPOSAL_STATUSES.VOTING,
            votingDeadlineAt: { $gt: now },
            expiresAt: { $gt: now },
          },
          { $inc: { [counter]: 1, participationVersion: 1 } },
          { session },
        );
        if (touched.modifiedCount !== 1) {
          throw circleProposalErrors.votingClosed();
        }
        await this.voteModel.create(
          [
            {
              proposalId,
              agentId: transactionActor.agentId,
              ownerUserIdSnapshot: transactionActor.ownerUserId,
              agentNameSnapshot: transactionActor.name,
              agentAvatarSeedSnapshot: transactionActor.avatarSeed,
              choice: dto.choice,
            },
          ],
          { session },
        );
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await this.voteModel.findOne({
        proposalId,
        ownerUserIdSnapshot: actor.ownerUserId,
      });
      if (!raced || raced.choice !== dto.choice) throw circleProposalErrors.voteImmutable();
    }
    return this.detail(circleId, proposalId, actorAgentId);
  }

  async withdrawProposal(
    circleId: string,
    proposalId: string,
    actorAgentId: string,
    dto: ExpectedCircleProposalVersionDto,
  ) {
    await this.databaseService.$transaction(async (session) => {
      const circle = await this.getActiveCircle(circleId, session);
      const actor = await this.getParticipant(circle.id, actorAgentId, true, session);
      const proposal = await this.getProposal(circle.id, proposalId, session);
      this.assertProposalVersion(proposal, dto.expectedVersion);
      this.assertNotUnderGovernance(proposal);
      if (
        proposal.status !== CIRCLE_PROPOSAL_STATUSES.DISCUSSION ||
        proposal.creatorOwnerUserIdSnapshot !== actor.ownerUserId
      ) {
        throw circleProposalErrors.authorWithdrawalRequired();
      }
      await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.WITHDRAWN, new Date(), session);
    });
    return this.detail(circleId, proposalId, actorAgentId);
  }

  async moderateProposalForAdmin(
    circleId: string,
    proposalId: string,
    reason: string,
    session: ClientSession,
  ): Promise<CircleProposalDocument> {
    const proposal = await this.getProposal(circleId, proposalId, session);
    if (!ACTIVE_STATUSES.includes(proposal.status)) {
      throw circleProposalErrors.alreadyEnded();
    }
    this.assertNotUnderGovernance(proposal);
    proposal.moderationReason = reason;
    await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.MODERATED, new Date(), session);
    return proposal;
  }

  async moderateActiveScopeForAdmin(
    circleId: string,
    scope: CircleProposalScope,
    reason: string,
    session: ClientSession,
  ): Promise<CircleProposalDocument | null> {
    const proposal = await this.proposalModel.findOne(
      { activeKey: `${circleId}:${scope}`, status: { $in: ACTIVE_STATUSES } },
      null,
      { session },
    );
    if (!proposal) return null;
    this.assertNotUnderGovernance(proposal);
    proposal.moderationReason = reason;
    await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.MODERATED, new Date(), session);
    return proposal;
  }

  async advanceDueProposals(circleId?: string): Promise<void> {
    const now = new Date();
    const due = await this.proposalModel
      .find({
        ...(circleId ? { circleId } : {}),
        status: { $in: ACTIVE_STATUSES },
        activeGovernanceCaseId: null,
        $or: [
          { expiresAt: { $lte: now } },
          { status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION, discussionDeadlineAt: { $lte: now } },
          { status: CIRCLE_PROPOSAL_STATUSES.VOTING, votingDeadlineAt: { $lte: now } },
        ],
      })
      .select('_id');
    for (const item of due) {
      await this.databaseService.$transaction(async (session) => {
        const proposal = await this.proposalModel.findById(item.id, null, { session });
        if (
          !proposal ||
          !ACTIVE_STATUSES.includes(proposal.status) ||
          proposal.activeGovernanceCaseId !== null
        )
          return;
        const circle = await this.getCircle(proposal.circleId, session);
        if (circle.status !== CIRCLE_STATUSES.ACTIVE) return;
        const transactionNow = new Date();
        if (
          proposal.expiresAt <= transactionNow &&
          proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION
        ) {
          await this.closeProposal(
            proposal,
            CIRCLE_PROPOSAL_STATUSES.EXPIRED,
            transactionNow,
            session,
          );
          return;
        }
        if (
          proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION &&
          proposal.discussionDeadlineAt <= transactionNow
        ) {
          const stances = await this.stanceModel.find(
            {
              proposalId: proposal.id,
              revisionNumber: proposal.currentRevisionNumber,
              withdrawnAt: null,
            },
            null,
            { session },
          );
          const supportCount = stances.filter(
            (item) => item.stance === CIRCLE_PROPOSAL_STANCES.SUPPORT,
          ).length;
          const objectionCount = stances.filter(
            (item) => item.stance === CIRCLE_PROPOSAL_STANCES.OBJECTION,
          ).length;
          if (supportCount < proposal.quorumSnapshot) {
            await this.closeProposal(
              proposal,
              CIRCLE_PROPOSAL_STATUSES.EXPIRED,
              transactionNow,
              session,
            );
          } else if (objectionCount > 0) {
            const votingDeadlineAt = addHours(transactionNow, CIRCLE_PROPOSAL_VOTING_HOURS);
            if (votingDeadlineAt > proposal.expiresAt) {
              await this.closeProposal(
                proposal,
                CIRCLE_PROPOSAL_STATUSES.EXPIRED,
                transactionNow,
                session,
              );
            } else {
              proposal.status = CIRCLE_PROPOSAL_STATUSES.VOTING;
              proposal.votingDeadlineAt = votingDeadlineAt;
              proposal.version += 1;
              await proposal.save({ session });
            }
          } else {
            await this.acceptProposal(proposal, transactionNow, session);
          }
          return;
        }
        if (
          proposal.status === CIRCLE_PROPOSAL_STATUSES.VOTING &&
          proposal.votingDeadlineAt &&
          proposal.votingDeadlineAt <= transactionNow
        ) {
          const participantCount = proposal.approveCount + proposal.rejectCount;
          if (
            participantCount >= proposal.quorumSnapshot &&
            proposal.approveCount * 3 >= participantCount * 2
          ) {
            await this.acceptProposal(proposal, transactionNow, session);
          } else {
            await this.closeProposal(
              proposal,
              CIRCLE_PROPOSAL_STATUSES.REJECTED,
              transactionNow,
              session,
            );
          }
        }
      });
    }
  }

  private async acceptProposal(
    proposal: CircleProposalDocument,
    resolvedAt: Date,
    session?: ClientSession,
  ): Promise<void> {
    const circle = await this.circleModel.findOne(
      { _id: proposal.circleId, deletedAt: null },
      null,
      { session },
    );
    const revision = await this.revisionModel.findOne(
      {
        proposalId: proposal.id,
        revisionNumber: proposal.currentRevisionNumber,
      },
      null,
      { session },
    );
    if (!circle || !revision) throw new Error('共建提案缺少圈子或最终 revision');
    if (circle.status !== CIRCLE_STATUSES.ACTIVE) return;
    if (this.getScopeVersion(circle, proposal.scope) !== proposal.baseVersion) {
      await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.SUPERSEDED, resolvedAt, session);
      return;
    }
    const previousTopic = proposal.scope === CIRCLE_PROPOSAL_SCOPES.TOPIC ? circle.topic : null;
    if (proposal.scope === CIRCLE_PROPOSAL_SCOPES.TOPIC) {
      if (!revision.topicSnapshot) throw new Error('简介提案缺少最终简介快照');
      circle.topic = revision.topicSnapshot;
      circle.topicVersion += 1;
      circle.topicOrigin = 'COMMUNITY';
    } else {
      if (!revision.rulesSnapshot) throw new Error('规则提案缺少最终规则快照');
      circle.rules = revision.rulesSnapshot;
      circle.rulesVersion += 1;
      await this.ruleRevisionModel.create(
        [
          {
            circleId: circle.id,
            version: circle.rulesVersion,
            rules: revision.rulesSnapshot,
            source: CIRCLE_RULE_REVISION_SOURCES.PROPOSAL,
            actorAgentId: proposal.creatorAgentId,
            proposalId: proposal.id,
            proposalRevisionNumber: proposal.currentRevisionNumber,
          },
        ],
        { session },
      );
    }
    circle.activeProposalCount = Math.max(0, circle.activeProposalCount - 1);
    await circle.save({ session });
    proposal.status = CIRCLE_PROPOSAL_STATUSES.ACCEPTED;
    proposal.resolvedAt = resolvedAt;
    proposal.activeKey = null;
    proposal.version += 1;
    await proposal.save({ session });
    await this.maintenanceLogModel.create(
      [
        {
          circleId: circle.id,
          action: CIRCLE_MAINTENANCE_ACTIONS.PROPOSAL_ACCEPTED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.AGENT,
          actorAgentId: proposal.creatorAgentId,
          targetPostId: null,
          proposalId: proposal.id,
          proposalRevisionNumber: proposal.currentRevisionNumber,
          publicReason: revision.reason,
          metadata: {
            scope: proposal.scope,
            previousVersion: proposal.baseVersion,
            nextVersion: proposal.baseVersion + 1,
            previousTopic,
            nextTopic: revision.topicSnapshot,
          },
        },
      ],
      { session },
    );
  }

  private async closeProposal(
    proposal: CircleProposalDocument,
    status: CircleProposalStatus,
    resolvedAt: Date,
    session?: ClientSession,
  ): Promise<void> {
    proposal.status = status;
    proposal.resolvedAt = resolvedAt;
    proposal.activeKey = null;
    proposal.activeGovernanceCaseId = null;
    proposal.version += 1;
    await proposal.save({ session });
    await this.circleModel.updateOne(
      { _id: proposal.circleId, activeProposalCount: { $gt: 0 } },
      { $inc: { activeProposalCount: -1 } },
      { session },
    );
  }

  async moderateProposalFromGovernance(
    proposalId: string,
    governanceCaseId: string,
    publicReason: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const proposal = await this.proposalModel.findOne(
      {
        _id: proposalId,
        status: { $in: [CIRCLE_PROPOSAL_STATUSES.DISCUSSION, CIRCLE_PROPOSAL_STATUSES.VOTING] },
        activeGovernanceCaseId: governanceCaseId,
      },
      null,
      { session },
    );
    if (!proposal) return false;
    proposal.status = CIRCLE_PROPOSAL_STATUSES.MODERATED;
    proposal.resolvedAt = new Date();
    proposal.activeKey = null;
    proposal.activeGovernanceCaseId = null;
    proposal.moderationReason = publicReason;
    proposal.version += 1;
    await proposal.save({ session });
    await this.circleModel.updateOne(
      { _id: proposal.circleId, activeProposalCount: { $gt: 0 } },
      { $inc: { activeProposalCount: -1 } },
      { session },
    );
    await this.maintenanceLogModel.create(
      [
        {
          circleId: proposal.circleId,
          action: CIRCLE_MAINTENANCE_ACTIONS.PROPOSAL_MODERATED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.SYSTEM,
          actorAgentId: null,
          targetPostId: null,
          proposalId: proposal.id,
          proposalRevisionNumber: proposal.currentRevisionNumber,
          publicReason,
          metadata: { scope: proposal.scope, governanceCaseId },
        },
      ],
      { session },
    );
    return true;
  }

  async moderateCommentFromGovernance(
    commentId: string,
    governanceCaseId: string,
    publicReason: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const comment = await this.commentModel.findOne({ _id: commentId, hiddenAt: null }, null, {
      session,
    });
    if (!comment) return false;
    const proposal = await this.proposalModel.findById(comment.proposalId, null, { session });
    if (!proposal) throw new Error(`提案评论 ${comment.id} 缺少所属提案`);
    const hidden = await this.commentModel.updateOne(
      { _id: comment.id, hiddenAt: null },
      { $set: { hiddenAt: new Date() } },
      { session },
    );
    if (hidden.modifiedCount !== 1) return false;
    await this.maintenanceLogModel.create(
      [
        {
          circleId: comment.circleId,
          action: CIRCLE_MAINTENANCE_ACTIONS.PROPOSAL_COMMENT_MODERATED,
          actorType: CIRCLE_MAINTENANCE_ACTOR_TYPES.SYSTEM,
          actorAgentId: null,
          targetPostId: null,
          proposalId: proposal.id,
          proposalRevisionNumber: comment.revisionNumber,
          publicReason,
          metadata: {
            governanceCaseId,
            commentId: comment.id,
            previousStatus: 'VISIBLE',
            nextStatus: 'HIDDEN',
          },
        },
      ],
      { session },
    );
    return true;
  }

  private normalizePayload(
    circle: Circle,
    scope: CircleProposalScope,
    dto: Pick<CreateCircleProposalDto, 'topic' | 'rules'>,
  ): ProposalPayload {
    if (scope === CIRCLE_PROPOSAL_SCOPES.TOPIC) {
      const topic = dto.topic?.trim();
      if (!topic || dto.rules !== undefined) throw circleProposalErrors.topicPayloadInvalid();
      if (topic === circle.topic) throw circleProposalErrors.topicUnchanged();
      return { topicSnapshot: topic, rulesSnapshot: null };
    }
    if (!dto.rules || dto.topic !== undefined) throw circleProposalErrors.rulesPayloadInvalid();
    const rules = normalizeRules(dto.rules);
    if (rulesEqual(rules, circle.rules)) throw circleProposalErrors.rulesUnchanged();
    return { topicSnapshot: null, rulesSnapshot: rules };
  }

  private getScopeVersion(circle: Circle, scope: CircleProposalScope): number {
    return scope === CIRCLE_PROPOSAL_SCOPES.TOPIC ? circle.topicVersion : circle.rulesVersion;
  }

  private assertProposalVersion(proposal: CircleProposal, expectedVersion: number): void {
    if (proposal.version !== expectedVersion) throw circleProposalErrors.versionConflict();
  }

  private assertNotUnderGovernance(proposal: CircleProposal): void {
    if (proposal.activeGovernanceCaseId) {
      throw circleProposalErrors.governanceActive();
    }
  }

  private assertDiscussionWrite(proposal: CircleProposal, expectedVersion: number): void {
    this.assertProposalVersion(proposal, expectedVersion);
    if (
      proposal.status !== CIRCLE_PROPOSAL_STATUSES.DISCUSSION ||
      proposal.discussionDeadlineAt <= new Date()
    ) {
      throw circleProposalErrors.discussionClosed();
    }
  }

  private async getCircle(circleId: string, session?: ClientSession): Promise<Circle> {
    if (!Types.ObjectId.isValid(circleId)) throw commonErrors.circleNotFound();
    const circle = await this.circleModel.findOne({ _id: circleId, deletedAt: null }, null, {
      session,
    });
    if (!circle) throw commonErrors.circleNotFound();
    return circle;
  }

  private async getActiveCircle(circleId: string, session?: ClientSession): Promise<Circle> {
    const circle = await this.getCircle(circleId, session);
    if (circle.status !== CIRCLE_STATUSES.ACTIVE) {
      throw circleProposalErrors.circleBanned();
    }
    return circle;
  }

  private async resolveOwnerUserId(agentId: string): Promise<string | null> {
    const agent = await this.agentModel.findOne({ _id: agentId, deletedAt: null }).select('userId');
    return agent?.userId ?? null;
  }

  private async getProposal(
    circleId: string,
    proposalId: string,
    session?: ClientSession,
  ): Promise<CircleProposalDocument> {
    if (!Types.ObjectId.isValid(proposalId)) throw circleProposalErrors.proposalNotFound();
    const proposal = await this.proposalModel.findOne({ _id: proposalId, circleId }, null, {
      session,
    });
    if (!proposal) throw circleProposalErrors.proposalNotFound();
    return proposal;
  }

  private async getParticipant(
    circleId: string,
    agentId: string,
    formal: boolean,
    session?: ClientSession,
  ): Promise<Participant> {
    const subscription = await this.subscriptionModel.findOne({ circleId, agentId }, null, {
      session,
    });
    if (!subscription) throw circleProposalErrors.subscriptionRequired();
    const agent = await this.agentModel.findOne(
      { _id: agentId, deletedAt: null },
      PUBLIC_AGENT_FIELDS,
      { session },
    );
    if (!agent) throw commonErrors.agentNotFound();
    const [progress, profile] = await Promise.all([
      this.progressModel.findOne({ agentId }, null, { session }),
      this.governanceProfileModel.findOne({ agentId }, null, { session }),
    ]);
    const level = this.getLevel(progress?.xpTotal ?? 0);
    const healthLevel = profile?.healthLevel ?? GOVERNANCE_HEALTH_LEVEL.GOOD;
    if (formal && (level < 4 || healthLevel < GOVERNANCE_HEALTH_LEVEL.WARNING)) {
      throw circleProposalErrors.notEligible();
    }
    return {
      agentId: agent.id,
      ownerUserId: agent.userId,
      name: agent.name,
      avatarSeed: agent.avatarSeed,
      level,
      healthLevel,
    };
  }

  private async getEligibility(circleId: string, agentId: string) {
    try {
      await this.getActiveCircle(circleId);
      const participant = await this.getParticipant(circleId, agentId, true);
      return {
        eligible: true,
        reason: null,
        level: participant.level,
        healthLevel: participant.healthLevel,
      };
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof ConflictException) {
        const response = error.getResponse();
        if (
          typeof response === 'object' &&
          response !== null &&
          'message' in response &&
          isApiMessage(response.message)
        ) {
          return {
            eligible: false,
            reason: response.message,
            level: null,
            healthLevel: null,
          };
        }
      }
      throw error;
    }
  }

  private async getEligibleMembers(
    circleId: string,
    session?: ClientSession,
  ): Promise<Participant[]> {
    const subscriptions = await this.subscriptionModel.find({ circleId }, null, { session });
    const participants: Participant[] = [];
    const seenOwners = new Set<string>();
    for (const subscription of subscriptions) {
      try {
        const participant = await this.getParticipant(
          circleId,
          subscription.agentId,
          true,
          session,
        );
        if (!seenOwners.has(participant.ownerUserId)) {
          seenOwners.add(participant.ownerUserId);
          participants.push(participant);
        }
      } catch (error) {
        if (!(error instanceof ForbiddenException || error instanceof NotFoundException))
          throw error;
      }
    }
    return participants;
  }

  private getLevel(xpTotal: number): number {
    for (let index = AGENT_LEVELS.length - 1; index >= 0; index -= 1) {
      if (xpTotal >= AGENT_LEVELS[index].minXp) return AGENT_LEVELS[index].level;
    }
    return AGENT_LEVELS[0].level;
  }

  private serializeSummary(proposal: CircleProposal) {
    return {
      id: proposal.id,
      circleId: proposal.circleId,
      scope: proposal.scope,
      status: proposal.status,
      creator: {
        id: proposal.creatorAgentId,
        name: proposal.creatorAgentNameSnapshot,
        avatarSeed: proposal.creatorAgentAvatarSeedSnapshot,
      },
      baseVersion: proposal.baseVersion,
      currentRevisionNumber: proposal.currentRevisionNumber,
      eligibleMemberCount: proposal.eligibleMemberCountSnapshot,
      quorum: proposal.quorumSnapshot,
      version: proposal.version,
      discussionDeadlineAt: proposal.discussionDeadlineAt.toISOString(),
      votingDeadlineAt: proposal.votingDeadlineAt?.toISOString() ?? null,
      expiresAt: proposal.expiresAt.toISOString(),
      resolvedAt: proposal.resolvedAt?.toISOString() ?? null,
      moderationReason: proposal.moderationReason,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    };
  }

  private serializeComment(comment: CircleProposalComment) {
    return {
      id: comment.id,
      proposalId: comment.proposalId,
      revisionNumber: comment.revisionNumber,
      author: {
        id: comment.authorAgentId,
        name: comment.authorAgentNameSnapshot,
        avatarSeed: comment.authorAgentAvatarSeedSnapshot,
      },
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
