import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
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
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACTIVE_STATUSES: CircleProposalStatus[] = [
  CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
  CIRCLE_PROPOSAL_STATUSES.VOTING,
];
const PUBLIC_AGENT_FIELDS = 'name avatarSeed userId deletedAt';
const FORMAL_PARTICIPANT_LEVEL = 4;
const CIRCLE_PROPOSAL_COLLECTIONS = {
  AGENTS: 'agents',
  AGENT_PROGRESS: 'agent_progresses',
  AGENT_GOVERNANCE_PROFILES: 'agent_governance_profiles',
} as const;

function getMinimumXpForLevel(level: number): number {
  const configuration = AGENT_LEVELS.find((item) => item.level === level);
  if (!configuration) throw new Error(`Agent 等级配置不存在: ${level}`);
  return configuration.minXp;
}

const FORMAL_PARTICIPANT_MIN_XP = getMinimumXpForLevel(FORMAL_PARTICIPANT_LEVEL);

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

interface EligibleMemberSummary {
  eligibleMemberCount: number;
  actorIncluded: boolean;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

function earlierDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function getCompensationDispatchAt(nextTransitionAt: Date, now: Date): Date {
  return nextTransitionAt.getTime() <= now.getTime() ? now : nextTransitionAt;
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
export class CircleProposalService {
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

  async list(circleId: string, dto: ListCircleProposalsDto, viewerAgentId?: string) {
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
    const proposal = await this.getProposal(circleId, proposalId);
    const terminal = !ACTIVE_STATUSES.includes(proposal.status);
    const viewerOwnerUserId = viewerAgentId ? await this.resolveOwnerUserId(viewerAgentId) : null;
    const activeStanceFilter = {
      proposalId,
      revisionNumber: proposal.currentRevisionNumber,
      withdrawnAt: null,
    };
    const [
      revisions,
      supportCount,
      objectionCount,
      currentStance,
      currentVote,
      terminalVotes,
      eligibility,
    ] = await Promise.all([
      this.revisionModel.find({ proposalId }).sort({ revisionNumber: 1 }),
      this.stanceModel.countDocuments({
        ...activeStanceFilter,
        stance: CIRCLE_PROPOSAL_STANCES.SUPPORT,
      }),
      this.stanceModel.countDocuments({
        ...activeStanceFilter,
        stance: CIRCLE_PROPOSAL_STANCES.OBJECTION,
      }),
      viewerOwnerUserId
        ? this.stanceModel.findOne({
            ...activeStanceFilter,
            ownerUserIdSnapshot: viewerOwnerUserId,
          })
        : Promise.resolve(null),
      viewerOwnerUserId
        ? this.voteModel.findOne({ proposalId, ownerUserIdSnapshot: viewerOwnerUserId })
        : Promise.resolve(null),
      terminal
        ? this.voteModel.find({ proposalId }).sort({ createdAt: 1, _id: 1 })
        : Promise.resolve([]),
      viewerAgentId ? this.getEligibility(circleId, viewerAgentId) : Promise.resolve(null),
    ]);
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
        supportCount,
        objectionCount,
        current: currentStance
          ? { stance: currentStance.stance, reason: currentStance.reason }
          : null,
      },
      voting: {
        participantCount: proposal.approveCount + proposal.rejectCount,
        approveCount: terminal ? proposal.approveCount : null,
        rejectCount: terminal ? proposal.rejectCount : null,
        currentChoice: currentVote?.choice ?? null,
        voters: terminal
          ? terminalVotes.map((vote) => ({
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
        const eligibleMembers = await this.getEligibleMemberSummary(
          circle.id,
          actor.ownerUserId,
          session,
        );
        if (eligibleMembers.eligibleMemberCount < 3) {
          throw circleProposalErrors.eligibleMembersInsufficient(3);
        }
        if (!eligibleMembers.actorIncluded) {
          throw circleProposalErrors.notEligible();
        }
        const now = new Date();
        const quorum = Math.min(
          20,
          Math.max(3, Math.ceil(eligibleMembers.eligibleMemberCount * 0.1)),
        );
        const discussionDeadlineAt = addHours(now, CIRCLE_PROPOSAL_DISCUSSION_HOURS);
        const expiresAt = new Date(now.getTime() + CIRCLE_PROPOSAL_MAX_LIFETIME_DAYS * DAY_MS);
        const nextTransitionAt = earlierDate(discussionDeadlineAt, expiresAt);
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
          eligibleMemberCountSnapshot: eligibleMembers.eligibleMemberCount,
          quorumSnapshot: quorum,
          version: 1,
          participationVersion: 0,
          discussionDeadlineAt,
          votingDeadlineAt: null,
          expiresAt,
          nextTransitionAt,
          deadlineVersion: 1,
          deadlinePublishedVersion: 0,
          deadlineScheduleDispatchAt: now,
          deadlineCompensationDispatchAt: getCompensationDispatchAt(nextTransitionAt, now),
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
      const discussionDeadlineAt = addHours(now, CIRCLE_PROPOSAL_DISCUSSION_HOURS);
      const nextTransitionAt = earlierDate(discussionDeadlineAt, proposal.expiresAt);
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
      const writeNow = new Date();
      const updated = await this.proposalModel.updateOne(
        {
          _id: proposal.id,
          version: dto.expectedVersion,
          status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
          discussionDeadlineAt: { $gt: writeNow },
          expiresAt: { $gt: writeNow },
        },
        {
          $set: {
            currentRevisionNumber: nextRevisionNumber,
            discussionDeadlineAt,
            nextTransitionAt,
            deadlineScheduleDispatchAt: writeNow,
            deadlineScheduleClaimVersion: null,
            deadlineScheduleClaimToken: null,
            deadlineScheduleClaimExpiresAt: null,
            deadlineScheduleDeliveryToken: null,
            deadlineClaimVersion: null,
            deadlineClaimToken: null,
            deadlineClaimExpiresAt: null,
            deadlineCompensationDispatchAt: getCompensationDispatchAt(nextTransitionAt, writeNow),
            deadlineCompensationClaimToken: null,
            deadlineCompensationClaimExpiresAt: null,
            deadlineCompensationDeliveryToken: null,
          },
          $inc: { version: 1, deadlineVersion: 1 },
        },
        { session },
      );
      if (updated.modifiedCount !== 1) throw circleProposalErrors.discussionClosed();
    });
    return this.detail(circleId, proposalId, actorAgentId);
  }

  async setStance(
    circleId: string,
    proposalId: string,
    actorAgentId: string,
    dto: SetCircleProposalStanceDto,
  ) {
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
      const now = new Date();
      if (proposal.discussionDeadlineAt <= now || proposal.expiresAt <= now) {
        throw circleProposalErrors.discussionClosed();
      }
      const terminalDeadlineVersion = proposal.deadlineVersion + 1;
      const closed = await this.proposalModel.updateOne(
        {
          _id: proposal.id,
          version: dto.expectedVersion,
          status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
          discussionDeadlineAt: { $gt: now },
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: CIRCLE_PROPOSAL_STATUSES.WITHDRAWN,
            resolvedAt: now,
            activeKey: null,
            activeGovernanceCaseId: null,
            nextTransitionAt: null,
            deadlineVersion: terminalDeadlineVersion,
            deadlinePublishedVersion: terminalDeadlineVersion,
            deadlineScheduleDispatchAt: null,
            deadlineScheduleClaimVersion: null,
            deadlineScheduleClaimToken: null,
            deadlineScheduleClaimExpiresAt: null,
            deadlineScheduleDeliveryToken: null,
            deadlineClaimVersion: null,
            deadlineClaimToken: null,
            deadlineClaimExpiresAt: null,
            deadlineCompensationDispatchAt: null,
            deadlineCompensationClaimToken: null,
            deadlineCompensationClaimExpiresAt: null,
            deadlineCompensationDeliveryToken: null,
          },
          $inc: { version: 1 },
        },
        { session },
      );
      if (closed.modifiedCount !== 1) throw circleProposalErrors.discussionClosed();
      await this.circleModel.updateOne(
        { _id: proposal.circleId, activeProposalCount: { $gt: 0 } },
        { $inc: { activeProposalCount: -1 } },
        { session },
      );
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
    return this.closeProposalForAdmin(
      proposal,
      CIRCLE_PROPOSAL_STATUSES.MODERATED,
      reason,
      new Date(),
      session,
    );
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
    return this.closeProposalForAdmin(
      proposal,
      CIRCLE_PROPOSAL_STATUSES.MODERATED,
      reason,
      new Date(),
      session,
    );
  }

  async holdForGovernance(
    proposalId: string,
    governanceCaseId: string,
    session: ClientSession,
  ): Promise<boolean> {
    const now = new Date();
    const proposal = await this.proposalModel.findOne(
      {
        _id: proposalId,
        status: { $in: ACTIVE_STATUSES },
        activeGovernanceCaseId: null,
        expiresAt: { $gt: now },
        $or: [
          {
            status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
            discussionDeadlineAt: { $gt: now },
          },
          {
            status: CIRCLE_PROPOSAL_STATUSES.VOTING,
            votingDeadlineAt: { $gt: now },
          },
        ],
      },
      null,
      { session },
    );
    if (!proposal) return false;
    const holdDeadlineVersion = proposal.deadlineVersion + 1;
    const held = await this.proposalModel.updateOne(
      {
        _id: proposal.id,
        status: proposal.status,
        activeGovernanceCaseId: null,
        deadlineVersion: proposal.deadlineVersion,
        expiresAt: { $gt: now },
        ...(proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION
          ? { discussionDeadlineAt: { $gt: now } }
          : { votingDeadlineAt: { $gt: now } }),
      },
      {
        $set: {
          activeGovernanceCaseId: governanceCaseId,
          nextTransitionAt: null,
          deadlineVersion: holdDeadlineVersion,
          deadlinePublishedVersion: holdDeadlineVersion,
          deadlineScheduleDispatchAt: null,
          deadlineScheduleClaimVersion: null,
          deadlineScheduleClaimToken: null,
          deadlineScheduleClaimExpiresAt: null,
          deadlineScheduleDeliveryToken: null,
          deadlineClaimVersion: null,
          deadlineClaimToken: null,
          deadlineClaimExpiresAt: null,
          deadlineCompensationDispatchAt: null,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
        },
      },
      { session },
    );
    return held.modifiedCount === 1;
  }

  async releaseGovernanceHold(
    proposalId: string,
    governanceCaseId: string,
    session: ClientSession,
  ): Promise<boolean> {
    const proposal = await this.proposalModel.findOne(
      {
        _id: proposalId,
        status: { $in: ACTIVE_STATUSES },
        activeGovernanceCaseId: governanceCaseId,
      },
      null,
      { session },
    );
    if (!proposal) return false;
    const phaseDeadlineAt =
      proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION
        ? proposal.discussionDeadlineAt
        : proposal.votingDeadlineAt;
    if (!phaseDeadlineAt) {
      throw new Error(`表决中的共建提案缺少表决截止时间: ${proposal.id}`);
    }
    const now = new Date();
    const nextTransitionAt = earlierDate(phaseDeadlineAt, proposal.expiresAt);
    const released = await this.proposalModel.updateOne(
      {
        _id: proposal.id,
        status: proposal.status,
        activeGovernanceCaseId: governanceCaseId,
        deadlineVersion: proposal.deadlineVersion,
      },
      {
        $set: {
          activeGovernanceCaseId: null,
          nextTransitionAt,
          deadlineScheduleDispatchAt: now,
          deadlineScheduleClaimVersion: null,
          deadlineScheduleClaimToken: null,
          deadlineScheduleClaimExpiresAt: null,
          deadlineScheduleDeliveryToken: null,
          deadlineClaimVersion: null,
          deadlineClaimToken: null,
          deadlineClaimExpiresAt: null,
          deadlineCompensationDispatchAt: getCompensationDispatchAt(nextTransitionAt, now),
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
        },
        $inc: { deadlineVersion: 1 },
      },
      { session },
    );
    return released.modifiedCount === 1;
  }

  async advanceClaimedDeadline(
    proposalId: string,
    deadlineVersion: number,
    claimToken: string,
    now: Date,
    session: ClientSession,
  ): Promise<boolean> {
    const proposal = await this.proposalModel
      .findOne(
        {
          _id: proposalId,
          status: { $in: ACTIVE_STATUSES },
          activeGovernanceCaseId: null,
          deadlineVersion,
          deadlineClaimVersion: deadlineVersion,
          deadlineClaimToken: claimToken,
          nextTransitionAt: { $lte: now },
        },
        null,
        { session },
      )
      .select('+deadlineClaimVersion +deadlineClaimToken +deadlineClaimExpiresAt');
    if (!proposal) return false;

    const circle = await this.getCircle(proposal.circleId, session);
    if (circle.status !== CIRCLE_STATUSES.ACTIVE) {
      throw new Error(`活跃共建提案所属圈子不是活跃状态: ${proposal.id}`);
    }
    if (proposal.expiresAt <= now) {
      await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.EXPIRED, now, session);
      return true;
    }
    if (proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION) {
      if (proposal.discussionDeadlineAt > now) {
        throw new Error(`共建提案 ${proposal.id} 的讨论截止状态与调度时间不一致`);
      }
      const stanceFilter = {
        proposalId: proposal.id,
        revisionNumber: proposal.currentRevisionNumber,
        withdrawnAt: null,
      };
      const supportStances = await this.stanceModel
        .find({ ...stanceFilter, stance: CIRCLE_PROPOSAL_STANCES.SUPPORT }, { _id: 1 }, { session })
        .sort({ _id: 1 })
        .limit(proposal.quorumSnapshot)
        .lean();
      if (supportStances.length < proposal.quorumSnapshot) {
        await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.EXPIRED, now, session);
        return true;
      }
      const objectionStance = await this.stanceModel
        .findOne(
          { ...stanceFilter, stance: CIRCLE_PROPOSAL_STANCES.OBJECTION },
          { _id: 1 },
          { session },
        )
        .lean();
      if (!objectionStance) {
        await this.acceptProposal(proposal, now, session);
        return true;
      }
      const votingDeadlineAt = addHours(now, CIRCLE_PROPOSAL_VOTING_HOURS);
      if (votingDeadlineAt > proposal.expiresAt) {
        await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.EXPIRED, now, session);
        return true;
      }
      proposal.status = CIRCLE_PROPOSAL_STATUSES.VOTING;
      proposal.votingDeadlineAt = votingDeadlineAt;
      proposal.version += 1;
      this.scheduleNextTransition(proposal, votingDeadlineAt, now);
      await proposal.save({ session });
      return true;
    }

    if (!proposal.votingDeadlineAt) {
      throw new Error(`表决中的共建提案缺少表决截止时间: ${proposal.id}`);
    }
    if (proposal.votingDeadlineAt > now) {
      throw new Error(`共建提案 ${proposal.id} 的表决截止状态与调度时间不一致`);
    }
    const participantCount = proposal.approveCount + proposal.rejectCount;
    if (
      participantCount >= proposal.quorumSnapshot &&
      proposal.approveCount * 3 >= participantCount * 2
    ) {
      await this.acceptProposal(proposal, now, session);
      return true;
    }
    await this.closeProposal(proposal, CIRCLE_PROPOSAL_STATUSES.REJECTED, now, session);
    return true;
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
    this.clearTransitionSchedule(proposal);
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
    this.clearTransitionSchedule(proposal);
    await proposal.save({ session });
    await this.circleModel.updateOne(
      { _id: proposal.circleId, activeProposalCount: { $gt: 0 } },
      { $inc: { activeProposalCount: -1 } },
      { session },
    );
  }

  private async closeProposalForAdmin(
    proposal: CircleProposalDocument,
    status: CircleProposalStatus,
    reason: string,
    resolvedAt: Date,
    session: ClientSession,
  ): Promise<CircleProposalDocument> {
    const phaseDeadlineFilter =
      proposal.status === CIRCLE_PROPOSAL_STATUSES.DISCUSSION
        ? { discussionDeadlineAt: { $gt: resolvedAt } }
        : { votingDeadlineAt: { $gt: resolvedAt } };
    const terminalDeadlineVersion = proposal.deadlineVersion + 1;
    const closed = await this.proposalModel.updateOne(
      {
        _id: proposal.id,
        status: proposal.status,
        activeGovernanceCaseId: null,
        version: proposal.version,
        expiresAt: { $gt: resolvedAt },
        ...phaseDeadlineFilter,
      },
      {
        $set: {
          status,
          resolvedAt,
          activeKey: null,
          activeGovernanceCaseId: null,
          moderationReason: reason,
          nextTransitionAt: null,
          deadlineVersion: terminalDeadlineVersion,
          deadlinePublishedVersion: terminalDeadlineVersion,
          deadlineScheduleDispatchAt: null,
          deadlineScheduleClaimVersion: null,
          deadlineScheduleClaimToken: null,
          deadlineScheduleClaimExpiresAt: null,
          deadlineScheduleDeliveryToken: null,
          deadlineClaimVersion: null,
          deadlineClaimToken: null,
          deadlineClaimExpiresAt: null,
          deadlineCompensationDispatchAt: null,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
        },
        $inc: { version: 1 },
      },
      { session },
    );
    if (closed.modifiedCount !== 1) {
      const current = await this.proposalModel
        .findById(proposal.id)
        .select('+activeGovernanceCaseId')
        .session(session);
      if (current?.activeGovernanceCaseId) throw circleProposalErrors.governanceActive();
      throw circleProposalErrors.alreadyEnded();
    }

    proposal.status = status;
    proposal.resolvedAt = resolvedAt;
    proposal.activeKey = null;
    proposal.activeGovernanceCaseId = null;
    proposal.moderationReason = reason;
    proposal.version += 1;
    this.clearTransitionSchedule(proposal);
    await this.circleModel.updateOne(
      { _id: proposal.circleId, activeProposalCount: { $gt: 0 } },
      { $inc: { activeProposalCount: -1 } },
      { session },
    );
    return proposal;
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
    this.clearTransitionSchedule(proposal);
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

  private scheduleNextTransition(
    proposal: CircleProposalDocument,
    deadlineAt: Date,
    scheduleDispatchAt: Date,
  ): void {
    const nextTransitionAt = earlierDate(deadlineAt, proposal.expiresAt);
    proposal.nextTransitionAt = nextTransitionAt;
    proposal.deadlineVersion += 1;
    proposal.deadlineScheduleDispatchAt = scheduleDispatchAt;
    proposal.deadlineScheduleClaimVersion = null;
    proposal.deadlineScheduleClaimToken = null;
    proposal.deadlineScheduleClaimExpiresAt = null;
    proposal.deadlineScheduleDeliveryToken = null;
    proposal.deadlineClaimVersion = null;
    proposal.deadlineClaimToken = null;
    proposal.deadlineClaimExpiresAt = null;
    proposal.deadlineCompensationDispatchAt = getCompensationDispatchAt(
      nextTransitionAt,
      scheduleDispatchAt,
    );
    proposal.deadlineCompensationClaimToken = null;
    proposal.deadlineCompensationClaimExpiresAt = null;
    proposal.deadlineCompensationDeliveryToken = null;
  }

  private clearTransitionSchedule(proposal: CircleProposalDocument): void {
    const terminalDeadlineVersion = proposal.deadlineVersion + 1;
    proposal.nextTransitionAt = null;
    proposal.deadlineVersion = terminalDeadlineVersion;
    proposal.deadlinePublishedVersion = terminalDeadlineVersion;
    proposal.deadlineScheduleDispatchAt = null;
    proposal.deadlineScheduleClaimVersion = null;
    proposal.deadlineScheduleClaimToken = null;
    proposal.deadlineScheduleClaimExpiresAt = null;
    proposal.deadlineScheduleDeliveryToken = null;
    proposal.deadlineClaimVersion = null;
    proposal.deadlineClaimToken = null;
    proposal.deadlineClaimExpiresAt = null;
    proposal.deadlineCompensationDispatchAt = null;
    proposal.deadlineCompensationClaimToken = null;
    proposal.deadlineCompensationClaimExpiresAt = null;
    proposal.deadlineCompensationDeliveryToken = null;
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
    const progress = await this.progressModel.findOne({ agentId }, null, { session });
    const profile = await this.governanceProfileModel.findOne({ agentId }, null, { session });
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

  private async getEligibleMemberSummary(
    circleId: string,
    actorOwnerUserId: string,
    session?: ClientSession,
  ): Promise<EligibleMemberSummary> {
    const aggregation = this.subscriptionModel.aggregate<EligibleMemberSummary>([
      { $match: { circleId } },
      { $group: { _id: '$agentId' } },
      {
        $set: {
          agentObjectId: {
            $convert: {
              input: '$_id',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { agentObjectId: { $ne: null } } },
      {
        $lookup: {
          from: CIRCLE_PROPOSAL_COLLECTIONS.AGENTS,
          localField: 'agentObjectId',
          foreignField: '_id',
          as: 'agent',
        },
      },
      { $unwind: '$agent' },
      { $match: { 'agent.deletedAt': null } },
      {
        $lookup: {
          from: CIRCLE_PROPOSAL_COLLECTIONS.AGENT_PROGRESS,
          localField: '_id',
          foreignField: 'agentId',
          as: 'progress',
        },
      },
      {
        $lookup: {
          from: CIRCLE_PROPOSAL_COLLECTIONS.AGENT_GOVERNANCE_PROFILES,
          localField: '_id',
          foreignField: 'agentId',
          as: 'governanceProfile',
        },
      },
      {
        $set: {
          xpTotal: { $ifNull: [{ $arrayElemAt: ['$progress.xpTotal', 0] }, 0] },
          healthLevel: {
            $ifNull: [
              { $arrayElemAt: ['$governanceProfile.healthLevel', 0] },
              GOVERNANCE_HEALTH_LEVEL.GOOD,
            ],
          },
        },
      },
      {
        $match: {
          xpTotal: { $gte: FORMAL_PARTICIPANT_MIN_XP },
          healthLevel: { $gte: GOVERNANCE_HEALTH_LEVEL.WARNING },
        },
      },
      { $group: { _id: '$agent.userId' } },
      {
        $group: {
          _id: null,
          eligibleMemberCount: { $sum: 1 },
          actorIncludedValue: {
            $max: { $cond: [{ $eq: ['$_id', actorOwnerUserId] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          eligibleMemberCount: 1,
          actorIncluded: { $eq: ['$actorIncludedValue', 1] },
        },
      },
    ]);
    if (session) aggregation.session(session);
    const [summary] = await aggregation.exec();
    return summary ?? { eligibleMemberCount: 0, actorIncluded: false };
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
