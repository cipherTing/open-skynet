import { ConflictException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Job } from 'bullmq';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import {
  AgentGovernanceProfile,
  AgentGovernanceProfileSchema,
} from '@/database/schemas/agent-governance-profile.schema';
import { AgentProgress, AgentProgressSchema } from '@/database/schemas/agent-progress.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import {
  CircleMaintenanceLog,
  CircleMaintenanceLogSchema,
} from '@/database/schemas/circle-maintenance-log.schema';
import {
  CircleProposalComment,
  CircleProposalCommentSchema,
} from '@/database/schemas/circle-proposal-comment.schema';
import {
  CircleProposalRevision,
  CircleProposalRevisionSchema,
} from '@/database/schemas/circle-proposal-revision.schema';
import {
  CircleProposalStanceRecord,
  CircleProposalStanceSchema,
} from '@/database/schemas/circle-proposal-stance.schema';
import {
  CircleProposalVote,
  CircleProposalVoteSchema,
} from '@/database/schemas/circle-proposal-vote.schema';
import { CircleProposal, CircleProposalSchema } from '@/database/schemas/circle-proposal.schema';
import {
  CircleRuleRevision,
  CircleRuleRevisionSchema,
} from '@/database/schemas/circle-rule-revision.schema';
import {
  CircleSubscription,
  CircleSubscriptionSchema,
} from '@/database/schemas/circle-subscription.schema';
import { DatabaseService } from '@/database/database.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import {
  CIRCLE_PROPOSAL_SCOPES,
  CIRCLE_PROPOSAL_STANCES,
  CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_PROPOSAL_VOTING_HOURS,
  CIRCLE_PROPOSAL_VOTES,
  CIRCLE_STATUSES,
} from './circle.constants';
import { CircleProposalService } from './circle-proposal.service';
import {
  CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
  CIRCLE_PROPOSAL_DEADLINE_QUEUE,
  CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS,
  CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES,
  CIRCLE_PROPOSAL_DEADLINE_JOB_PRIORITY,
  CIRCLE_PROPOSAL_DEADLINE_PUBLISH_INTERVAL_MS,
  CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_INTERVAL_MS,
  CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS,
  CIRCLE_PROPOSAL_DEADLINE_CONTROL_JOB_PRIORITY,
  CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS,
  getCircleProposalDeadlineDeduplicationId,
  type CircleProposalDeadlineJob,
} from './circle-proposal-deadline.constants';
import { CircleProposalDeadlinePublisher } from './circle-proposal-deadline.publisher';
import { CircleProposalDeadlineProcessor } from './circle-proposal-deadline.processor';
import { CircleProposalDeadlineService } from './circle-proposal-deadline.service';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';

const HOUR_MS = 60 * 60 * 1_000;

describe('CircleProposalService write boundaries', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: CircleProposalService;
  let deadlinePublisher: CircleProposalDeadlinePublisher;
  let deadlineProcessor: CircleProposalDeadlineProcessor;
  let deadlineService: CircleProposalDeadlineService;
  let databaseService: DatabaseService;

  const featureFlagService = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
  };
  const deadlineQueue = {
    add: jest.fn().mockResolvedValue(undefined),
    addBulk: jest.fn().mockResolvedValue(undefined),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: CircleMaintenanceLog.name, schema: CircleMaintenanceLogSchema },
          { name: CircleProposal.name, schema: CircleProposalSchema },
          { name: CircleProposalComment.name, schema: CircleProposalCommentSchema },
          { name: CircleProposalRevision.name, schema: CircleProposalRevisionSchema },
          { name: CircleProposalStanceRecord.name, schema: CircleProposalStanceSchema },
          { name: CircleProposalVote.name, schema: CircleProposalVoteSchema },
          { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
          { name: CircleSubscription.name, schema: CircleSubscriptionSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        CircleProposalService,
        CircleProposalDeadlinePublisher,
        CircleProposalDeadlineProcessor,
        CircleProposalDeadlineService,
        { provide: FeatureFlagService, useValue: featureFlagService },
        { provide: getQueueToken(CIRCLE_PROPOSAL_DEADLINE_QUEUE), useValue: deadlineQueue },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(CircleProposalService);
    deadlinePublisher = moduleRef.get(CircleProposalDeadlinePublisher);
    deadlineProcessor = moduleRef.get(CircleProposalDeadlineProcessor);
    deadlineService = moduleRef.get(CircleProposalDeadlineService);
    databaseService = moduleRef.get(DatabaseService);
    await Promise.all([
      connection.model(Agent.name).init(),
      connection.model(Circle.name).init(),
      connection.model(CircleProposal.name).init(),
      connection.model(CircleProposalStanceRecord.name).init(),
      connection.model(CircleProposalVote.name).init(),
      connection.model(CircleSubscription.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    deadlineQueue.add.mockResolvedValue(undefined);
    deadlineQueue.addBulk.mockResolvedValue(undefined);
    deadlineQueue.upsertJobScheduler.mockResolvedValue(undefined);
    await Promise.all([
      connection.model(Agent.name).deleteMany({}),
      connection.model(AgentGovernanceProfile.name).deleteMany({}),
      connection.model(AgentProgress.name).deleteMany({}),
      connection.model(Circle.name).deleteMany({}),
      connection.db?.collection('circle_maintenance_logs').deleteMany({}),
      connection.model(CircleProposalComment.name).deleteMany({}),
      connection.model(CircleProposalRevision.name).deleteMany({}),
      connection.model(CircleProposalStanceRecord.name).deleteMany({}),
      connection.model(CircleProposalVote.name).deleteMany({}),
      connection.model(CircleProposal.name).deleteMany({}),
      connection.model(CircleSubscription.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
    if (replicaSet) await replicaSet.stop();
  });

  async function createCircle(status: 'ACTIVE' | 'BANNED') {
    return connection.model(Circle.name).create({
      slug: `proposal-${status.toLowerCase()}`,
      name: `Proposal ${status}`,
      normalizedName: `proposal ${status.toLowerCase()}`,
      topic: '当前圈子简介',
      createdByType: 'AGENT',
      createdByAgentId: null,
      rules: [],
      topicVersion: 1,
      topicOrigin: 'CREATION',
      rulesVersion: 1,
      activeProposalCount: 0,
      creationWeekKey: null,
      kind: 'NORMAL',
      status,
      bannedAt: status === CIRCLE_STATUSES.BANNED ? new Date() : null,
      subscriberCount: 0,
      postCount: 0,
      lastPostAt: null,
      deletedAt: null,
    });
  }

  async function createSubscribedAgent(
    circleId: string,
    label: string,
    options: {
      xpTotal: number;
      healthLevel: number;
      deletedAt?: Date | null;
    },
  ) {
    const agent = await connection.model(Agent.name).create({
      name: label,
      description: `${label} description`,
      userId: `${label}-owner`,
      avatarSeed: `${label}-avatar`,
      deletedAt: options.deletedAt ?? null,
    });
    await Promise.all([
      connection.model(AgentProgress.name).create({
        agentId: agent.id,
        xpTotal: options.xpTotal,
      }),
      connection.model(AgentGovernanceProfile.name).create({
        agentId: agent.id,
        healthLevel: options.healthLevel,
      }),
      connection.model(CircleSubscription.name).create({
        agentId: agent.id,
        circleId,
      }),
    ]);
    return agent;
  }

  function createEligibleAgent(circleId: string, label: string) {
    return createSubscribedAgent(circleId, label, {
      xpTotal: 5_000,
      healthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
    });
  }

  async function createVotingProposal(circleId: string, creatorAgentId: string) {
    const votingDeadlineAt = new Date(Date.now() + 60_000);
    return connection.model(CircleProposal.name).create({
      circleId,
      scope: CIRCLE_PROPOSAL_SCOPES.TOPIC,
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      creatorAgentId,
      creatorOwnerUserIdSnapshot: 'creator-owner',
      creatorAgentNameSnapshot: 'Creator',
      creatorAgentAvatarSeedSnapshot: 'creator-avatar',
      baseVersion: 1,
      currentRevisionNumber: 1,
      eligibleMemberCountSnapshot: 3,
      quorumSnapshot: 3,
      version: 1,
      participationVersion: 0,
      discussionDeadlineAt: new Date(Date.now() - 60_000),
      votingDeadlineAt,
      expiresAt: new Date(Date.now() + 120_000),
      nextTransitionAt: votingDeadlineAt,
      deadlineVersion: 1,
      deadlinePublishedVersion: 1,
      deadlineScheduleDispatchAt: new Date(),
      deadlineScheduleClaimVersion: null,
      deadlineScheduleClaimToken: null,
      deadlineScheduleClaimExpiresAt: null,
      deadlineScheduleDeliveryToken: null,
      deadlineCompensationDispatchAt: votingDeadlineAt,
      deadlineCompensationClaimToken: null,
      deadlineCompensationClaimExpiresAt: null,
      deadlineCompensationDeliveryToken: null,
      deadlineClaimVersion: null,
      deadlineClaimToken: null,
      deadlineClaimExpiresAt: null,
      resolvedAt: null,
      moderationReason: null,
      approveCount: 0,
      rejectCount: 0,
      activeKey: `${circleId}:${CIRCLE_PROPOSAL_SCOPES.TOPIC}`,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  it('rejects new proposals and votes while the circle is banned', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.BANNED);
    const actor = await createEligibleAgent(circle.id, 'banned-actor');

    await expect(
      service.create(circle.id, actor.id, crypto.randomUUID(), {
        scope: CIRCLE_PROPOSAL_SCOPES.TOPIC,
        expectedVersion: 1,
        reason: '希望更新圈子简介',
        topic: '新的圈子简介',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const proposal = await createVotingProposal(circle.id, actor.id);
    await expect(
      service.vote(circle.id, proposal.id, actor.id, {
        expectedVersion: 1,
        choice: CIRCLE_PROPOSAL_VOTES.APPROVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await connection.model(CircleProposalVote.name).countDocuments()).toBe(0);
  });

  it('freezes the current topic as the proposal baseline for later comparison', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const [creator] = await Promise.all([
      createEligibleAgent(circle.id, 'baseline-creator'),
      createEligibleAgent(circle.id, 'baseline-member-a'),
      createEligibleAgent(circle.id, 'baseline-member-b'),
    ]);

    const detail = await service.create(circle.id, creator.id, crypto.randomUUID(), {
      scope: CIRCLE_PROPOSAL_SCOPES.TOPIC,
      expectedVersion: 1,
      reason: '让圈子简介更准确',
      topic: '更新后的圈子简介',
    });

    expect(detail.base).toEqual({ topic: '当前圈子简介', rules: null });
    expect(detail.revisions.at(-1)).toMatchObject({ topic: '更新后的圈子简介' });
  });

  it('freezes only eligible subscribed owners in the proposal quorum snapshot', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const [creator] = await Promise.all([
      createEligibleAgent(circle.id, 'eligibility-creator'),
      createEligibleAgent(circle.id, 'eligibility-member-a'),
      createEligibleAgent(circle.id, 'eligibility-member-b'),
      createSubscribedAgent(circle.id, 'eligibility-low-xp', {
        xpTotal: 4_999,
        healthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
      }),
      createSubscribedAgent(circle.id, 'eligibility-penalized', {
        xpTotal: 5_000,
        healthLevel: GOVERNANCE_HEALTH_LEVEL.PENALIZED,
      }),
      createSubscribedAgent(circle.id, 'eligibility-deleted', {
        xpTotal: 5_000,
        healthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
        deletedAt: new Date(),
      }),
    ]);

    const detail = await service.create(circle.id, creator.id, crypto.randomUUID(), {
      scope: CIRCLE_PROPOSAL_SCOPES.TOPIC,
      expectedVersion: 1,
      reason: '验证共建资格人数冻结',
      topic: '资格人数冻结后的圈子简介',
    });

    expect(detail).toMatchObject({ eligibleMemberCount: 3, quorum: 3 });
  });

  it('records the first vote and its counters atomically, then refuses changes', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const actor = await createEligibleAgent(circle.id, 'voting-actor');
    const proposal = await createVotingProposal(circle.id, actor.id);

    await service.vote(circle.id, proposal.id, actor.id, {
      expectedVersion: 1,
      choice: CIRCLE_PROPOSAL_VOTES.APPROVE,
    });
    await service.vote(circle.id, proposal.id, actor.id, {
      expectedVersion: 1,
      choice: CIRCLE_PROPOSAL_VOTES.APPROVE,
    });

    const stored = await connection.model(CircleProposal.name).findById(proposal.id);
    expect(stored).toMatchObject({
      approveCount: 1,
      rejectCount: 0,
      participationVersion: 1,
    });
    expect(await connection.model(CircleProposalVote.name).countDocuments()).toBe(1);
    await expect(
      service.vote(circle.id, proposal.id, actor.id, {
        expectedVersion: 1,
        choice: CIRCLE_PROPOSAL_VOTES.REJECT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not persist a vote after the server deadline', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'deadline-creator');
    const voter = await createEligibleAgent(circle.id, 'deadline-voter');
    const proposal = await createVotingProposal(circle.id, creator.id);
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          votingDeadlineAt: new Date(Date.now() - 1_000),
          nextTransitionAt: new Date(Date.now() - 1_000),
        },
      },
    );

    await expect(
      service.vote(circle.id, proposal.id, voter.id, {
        expectedVersion: 1,
        choice: CIRCLE_PROPOSAL_VOTES.APPROVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await connection.model(CircleProposalVote.name).countDocuments({
        ownerUserIdSnapshot: voter.userId,
      }),
    ).toBe(0);
  });

  it('does not settle a due proposal while a governance case is reviewing it', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'governance-held-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const governanceCaseId = new Types.ObjectId().toString();
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          votingDeadlineAt: new Date(Date.now() - 1_000),
          nextTransitionAt: new Date(Date.now() - 1_000),
          activeGovernanceCaseId: governanceCaseId,
        },
      },
    );

    await expect(deadlineService.processProposal(proposal.id, 1)).resolves.toBe(false);

    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      activeGovernanceCaseId: governanceCaseId,
      resolvedAt: null,
    });
  });

  it('registers separate publisher and compensation schedulers with bounded priority', async () => {
    await deadlinePublisher.onModuleInit();

    expect(deadlineQueue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(deadlineQueue.upsertJobScheduler).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      { every: CIRCLE_PROPOSAL_DEADLINE_PUBLISH_INTERVAL_MS },
      expect.objectContaining({
        opts: expect.objectContaining({
          priority: CIRCLE_PROPOSAL_DEADLINE_CONTROL_JOB_PRIORITY,
        }),
      }),
    );
    expect(deadlineQueue.upsertJobScheduler).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      { every: CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_INTERVAL_MS },
      expect.objectContaining({
        opts: expect.objectContaining({
          priority: CIRCLE_PROPOSAL_DEADLINE_CONTROL_JOB_PRIORITY,
        }),
      }),
    );
  });

  it('invalidates the old deadline while governance holds a proposal and republishes on release', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'governance-schedule-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const governanceCaseId = new Types.ObjectId().toString();

    await databaseService.$transaction(async (session) => {
      await expect(service.holdForGovernance(proposal.id, governanceCaseId, session)).resolves.toBe(
        true,
      );
    });
    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      activeGovernanceCaseId: governanceCaseId,
      nextTransitionAt: null,
      deadlineVersion: 2,
      deadlinePublishedVersion: 2,
      deadlineScheduleDispatchAt: null,
    });

    await databaseService.$transaction(async (session) => {
      await expect(
        service.releaseGovernanceHold(proposal.id, governanceCaseId, session),
      ).resolves.toBe(true);
    });
    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      activeGovernanceCaseId: null,
      nextTransitionAt: proposal.votingDeadlineAt,
      deadlineVersion: 3,
      deadlinePublishedVersion: 2,
      deadlineScheduleDispatchAt: expect.any(Date),
    });
  });

  it('does not create a governance hold after the phase deadline', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'late-governance-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const overdueAt = new Date(Date.now() - 1_000);
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          votingDeadlineAt: overdueAt,
          nextTransitionAt: overdueAt,
          deadlineCompensationDispatchAt: overdueAt,
        },
      },
    );

    await databaseService.$transaction(async (session) => {
      await expect(
        service.holdForGovernance(proposal.id, 'late-governance-case', session),
      ).resolves.toBe(false);
    });
    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      activeGovernanceCaseId: null,
    });
  });

  it('rejects administrator termination after the phase deadline', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'late-admin-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const overdueAt = new Date(Date.now() - 1_000);
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          votingDeadlineAt: overdueAt,
          nextTransitionAt: overdueAt,
          deadlineCompensationDispatchAt: overdueAt,
        },
      },
    );

    await expect(
      databaseService.$transaction((session) =>
        service.moderateProposalForAdmin(
          circle.id,
          proposal.id,
          '截止后不应再由管理员直接终止。',
          session,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      databaseService.$transaction((session) =>
        service.moderateActiveScopeForAdmin(
          circle.id,
          CIRCLE_PROPOSAL_SCOPES.TOPIC,
          '截止后不应再按范围终止。',
          session,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      activeKey: `${circle.id}:${CIRCLE_PROPOSAL_SCOPES.TOPIC}`,
    });
  });

  it('keeps reads side-effect free and settles one matching schedule version idempotently', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'scheduled-settlement-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const overdueAt = new Date(Date.now() - 1_000);
    const deliveryToken = crypto.randomUUID();
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          votingDeadlineAt: overdueAt,
          nextTransitionAt: overdueAt,
          deadlineCompensationDispatchAt: overdueAt,
          deadlineCompensationClaimExpiresAt: new Date(Date.now() + 60_000),
          deadlineCompensationDeliveryToken: deliveryToken,
        },
      },
    );

    await service.detail(circle.id, proposal.id, creator.id);
    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      deadlineVersion: 1,
    });

    await expect(deadlineService.processProposal(proposal.id, 2)).resolves.toBe(false);
    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      deadlineVersion: 1,
    });

    await expect(deadlineService.processProposal(proposal.id, 1)).resolves.toBe(true);
    await expect(deadlineService.processProposal(proposal.id, 1)).resolves.toBe(false);
    const settled = await connection
      .model(CircleProposal.name)
      .findById(proposal.id)
      .select('+deadlineCompensationClaimExpiresAt +deadlineCompensationDeliveryToken');
    expect(settled).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.REJECTED,
      nextTransitionAt: null,
      deadlineVersion: 2,
      deadlinePublishedVersion: 2,
      deadlineScheduleDispatchAt: null,
      deadlineCompensationClaimExpiresAt: null,
      deadlineCompensationDeliveryToken: null,
    });
  });

  it('settles a large discussion with quorum-bounded stance reads', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'bounded-stance-creator');
    const overdueAt = new Date(Date.now() - 1_000);
    const proposal = await connection.model(CircleProposal.name).create({
      circleId: circle.id,
      scope: CIRCLE_PROPOSAL_SCOPES.TOPIC,
      status: CIRCLE_PROPOSAL_STATUSES.DISCUSSION,
      creatorAgentId: creator.id,
      creatorOwnerUserIdSnapshot: creator.userId,
      creatorAgentNameSnapshot: creator.name,
      creatorAgentAvatarSeedSnapshot: creator.avatarSeed,
      baseVersion: 1,
      baseTopicSnapshot: '旧简介',
      baseRulesSnapshot: null,
      currentRevisionNumber: 1,
      eligibleMemberCountSnapshot: 1_000,
      quorumSnapshot: 20,
      version: 1,
      participationVersion: 1_000,
      discussionDeadlineAt: overdueAt,
      votingDeadlineAt: null,
      expiresAt: new Date(Date.now() + (CIRCLE_PROPOSAL_VOTING_HOURS + 1) * HOUR_MS),
      nextTransitionAt: overdueAt,
      deadlineVersion: 1,
      deadlinePublishedVersion: 1,
      deadlineScheduleDispatchAt: null,
      deadlineCompensationDispatchAt: overdueAt,
      activeKey: `${circle.id}:${CIRCLE_PROPOSAL_SCOPES.TOPIC}`,
      activeGovernanceCaseId: null,
      idempotencyKey: crypto.randomUUID(),
    });
    const stanceHistorySize = 1_000;
    await connection.model(CircleProposalStanceRecord.name).insertMany(
      Array.from({ length: stanceHistorySize }, (_, index) => ({
        proposalId: proposal.id,
        revisionNumber: 1,
        agentId: new Types.ObjectId().toString(),
        ownerUserIdSnapshot: `bounded-stance-owner-${index}`,
        agentNameSnapshot: `Bounded stance ${index}`,
        agentAvatarSeedSnapshot: `bounded-stance-avatar-${index}`,
        stance:
          index === stanceHistorySize - 1
            ? CIRCLE_PROPOSAL_STANCES.OBJECTION
            : CIRCLE_PROPOSAL_STANCES.SUPPORT,
        reason: null,
        withdrawnAt: null,
      })),
    );

    const stanceCollection = connection.collection('circle_proposal_stances');
    const [supportExplain, objectionExplain] = await Promise.all([
      stanceCollection
        .find({
          proposalId: proposal.id,
          revisionNumber: 1,
          withdrawnAt: null,
          stance: CIRCLE_PROPOSAL_STANCES.SUPPORT,
        })
        .sort({ _id: 1 })
        .limit(proposal.quorumSnapshot)
        .explain('executionStats'),
      stanceCollection
        .find({
          proposalId: proposal.id,
          revisionNumber: 1,
          withdrawnAt: null,
          stance: CIRCLE_PROPOSAL_STANCES.OBJECTION,
        })
        .limit(1)
        .explain('executionStats'),
    ]);
    expect(supportExplain.executionStats.totalDocsExamined).toBeLessThanOrEqual(
      proposal.quorumSnapshot,
    );
    expect(objectionExplain.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);

    await expect(deadlineService.processProposal(proposal.id, 1)).resolves.toBe(true);
    const settledProposal = await connection
      .model(CircleProposal.name)
      .findById(proposal.id)
      .lean();
    expect(settledProposal).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      deadlineVersion: 2,
    });
  });

  it('publishes 105 proposal schedules in three bounded batches', async () => {
    const now = Date.now();
    const overdueAt = new Date(now - 60_000);
    const expiresAt = new Date(now + 60_000);
    await connection.model(CircleProposal.name).insertMany(
      Array.from({ length: 105 }, (_, index) => ({
        circleId: new Types.ObjectId().toString(),
        scope: CIRCLE_PROPOSAL_SCOPES.TOPIC,
        status: CIRCLE_PROPOSAL_STATUSES.VOTING,
        creatorAgentId: new Types.ObjectId().toString(),
        creatorOwnerUserIdSnapshot: `batch-owner-${index}`,
        creatorAgentNameSnapshot: `Batch creator ${index}`,
        creatorAgentAvatarSeedSnapshot: `batch-avatar-${index}`,
        baseVersion: 1,
        baseTopicSnapshot: '旧简介',
        baseRulesSnapshot: null,
        currentRevisionNumber: 1,
        eligibleMemberCountSnapshot: 3,
        quorumSnapshot: 3,
        version: 1,
        participationVersion: 0,
        discussionDeadlineAt: overdueAt,
        votingDeadlineAt: overdueAt,
        expiresAt,
        nextTransitionAt: overdueAt,
        deadlineVersion: 1,
        deadlinePublishedVersion: 1,
        deadlineScheduleDispatchAt: new Date(),
        deadlineScheduleClaimVersion: null,
        deadlineScheduleClaimToken: null,
        deadlineScheduleClaimExpiresAt: null,
        deadlineScheduleDeliveryToken: null,
        deadlineCompensationDispatchAt: overdueAt,
        deadlineCompensationClaimToken: null,
        deadlineCompensationClaimExpiresAt: null,
        deadlineCompensationDeliveryToken: null,
        deadlineClaimVersion: null,
        deadlineClaimToken: null,
        deadlineClaimExpiresAt: null,
        resolvedAt: null,
        moderationReason: null,
        approveCount: 0,
        rejectCount: 0,
        activeKey: null,
        activeGovernanceCaseId: null,
        idempotencyKey: crypto.randomUUID(),
      })),
    );

    await expect(deadlinePublisher.publishCompensationBatch()).resolves.toBeUndefined();
    const compensationDispatchCutoff = new Date(now);
    expect(
      await connection.model(CircleProposal.name).countDocuments({
        deadlineCompensationDispatchAt: { $gt: compensationDispatchCutoff },
      }),
    ).toBe(50);
    expect(
      await connection.model(CircleProposal.name).countDocuments({
        deadlineCompensationDispatchAt: { $lte: compensationDispatchCutoff },
      }),
    ).toBe(55);

    expect(deadlineQueue.addBulk).toHaveBeenCalledTimes(1);
    expect(deadlineQueue.addBulk.mock.calls[0][0]).toHaveLength(50);
    expect(deadlineQueue.addBulk.mock.calls[0][0][0]).toMatchObject({
      name: CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES.ADVANCE_PROPOSAL,
      data: expect.objectContaining({ deadlineVersion: 1 }),
      opts: expect.objectContaining({
        attempts: 5,
        priority: CIRCLE_PROPOSAL_DEADLINE_JOB_PRIORITY,
        deduplication: {
          id: expect.stringContaining('circle-proposal-'),
        },
      }),
    });
    expect(deadlineQueue.add).toHaveBeenCalledWith(
      CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES.COMPENSATE,
      { kind: CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.COMPENSATE },
      expect.objectContaining({
        attempts: 5,
        priority: CIRCLE_PROPOSAL_DEADLINE_CONTROL_JOB_PRIORITY,
        deduplication: {
          id: CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
          keepLastIfActive: true,
        },
      }),
    );
    const leasedDelivery = await connection
      .model(CircleProposal.name)
      .findOne({ deadlineCompensationDispatchAt: { $gt: compensationDispatchCutoff } })
      .select('+deadlineCompensationClaimExpiresAt +deadlineCompensationDeliveryToken');
    if (
      !leasedDelivery?.deadlineCompensationClaimExpiresAt ||
      !leasedDelivery.deadlineCompensationDeliveryToken
    ) {
      throw new Error('补偿任务成功入队后没有保留有限交付租约');
    }
    expect(leasedDelivery.deadlineCompensationClaimExpiresAt.getTime()).toBeGreaterThan(
      compensationDispatchCutoff.getTime(),
    );

    deadlineQueue.addBulk.mockClear();
    await expect(deadlinePublisher.publishCompensationBatch()).resolves.toBeUndefined();
    expect(deadlineQueue.addBulk).toHaveBeenCalledTimes(1);
    expect(deadlineQueue.addBulk.mock.calls[0][0]).toHaveLength(50);
    deadlineQueue.addBulk.mockClear();
    await expect(deadlinePublisher.publishCompensationBatch()).resolves.toBeUndefined();
    expect(deadlineQueue.addBulk).toHaveBeenCalledTimes(1);
    expect(deadlineQueue.addBulk.mock.calls[0][0]).toHaveLength(5);
    deadlineQueue.addBulk.mockClear();
    await expect(deadlinePublisher.publishCompensationBatch()).resolves.toBeUndefined();
    expect(deadlineQueue.addBulk).not.toHaveBeenCalled();

    await connection.model(CircleProposal.name).updateOne(
      { _id: leasedDelivery.id },
      {
        $set: {
          deadlineCompensationDispatchAt: overdueAt,
          deadlineCompensationClaimExpiresAt: overdueAt,
        },
      },
    );
    await expect(deadlinePublisher.publishCompensationBatch()).resolves.toBeUndefined();
    expect(deadlineQueue.addBulk).toHaveBeenCalledTimes(1);
    expect(deadlineQueue.addBulk.mock.calls[0][0]).toHaveLength(1);
    expect(deadlineQueue.addBulk.mock.calls[0][0][0]?.data.deliveryToken).not.toBe(
      leasedDelivery.deadlineCompensationDeliveryToken,
    );

    deadlineQueue.addBulk.mockClear();
    const futureDeadlineAt = new Date(Date.now() + 60_000);
    await connection.model(CircleProposal.name).updateMany(
      {},
      {
        $set: {
          nextTransitionAt: futureDeadlineAt,
          deadlineVersion: 2,
          deadlinePublishedVersion: 1,
          deadlineScheduleDispatchAt: new Date(),
          deadlineScheduleClaimVersion: null,
          deadlineScheduleClaimToken: null,
          deadlineScheduleClaimExpiresAt: null,
          deadlineScheduleDeliveryToken: null,
          deadlineCompensationDispatchAt: futureDeadlineAt,
          deadlineCompensationClaimToken: null,
          deadlineCompensationClaimExpiresAt: null,
          deadlineCompensationDeliveryToken: null,
        },
      },
    );
    await expect(deadlinePublisher.publishPendingBatch()).resolves.toBeUndefined();
    expect(deadlineQueue.addBulk).toHaveBeenCalledTimes(1);
    expect(deadlineQueue.addBulk.mock.calls[0][0]).toHaveLength(50);
    expect(
      await connection.model(CircleProposal.name).countDocuments({
        deadlineVersion: 2,
        deadlinePublishedVersion: 2,
      }),
    ).toBe(50);
    expect(
      await connection.model(CircleProposal.name).countDocuments({
        deadlineVersion: 2,
        deadlinePublishedVersion: 1,
      }),
    ).toBe(55);
    expect(
      await connection.model(CircleProposal.name).countDocuments({
        deadlineVersion: 2,
        deadlineScheduleDispatchAt: null,
      }),
    ).toBe(50);

    const firstDelivery = deadlineQueue.addBulk.mock.calls[0][0][0];
    expect(firstDelivery.opts.deduplication).toEqual({
      id: getCircleProposalDeadlineDeduplicationId(
        firstDelivery.data.proposalId,
        firstDelivery.data.deadlineVersion,
      ),
    });
  });

  it('releases publication claims when BullMQ rejects a batch', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'publish-failure-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          deadlineVersion: 2,
          deadlinePublishedVersion: 1,
          deadlineScheduleDispatchAt: new Date(),
        },
      },
    );
    deadlineQueue.addBulk.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(deadlinePublisher.publishPendingBatch()).rejects.toThrow('queue unavailable');
    const stored = await connection
      .model(CircleProposal.name)
      .findById(proposal.id)
      .select('+deadlineScheduleClaimVersion +deadlineScheduleClaimToken');
    expect(stored).toMatchObject({
      deadlinePublishedVersion: 1,
      deadlineScheduleClaimVersion: null,
      deadlineScheduleClaimToken: null,
    });
  });

  it('clears a compensation delivery immediately when BullMQ rejects the batch', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'compensation-failure-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const overdueAt = new Date(Date.now() - 1_000);
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          votingDeadlineAt: overdueAt,
          nextTransitionAt: overdueAt,
          deadlineCompensationDispatchAt: overdueAt,
        },
      },
    );
    deadlineQueue.addBulk.mockRejectedValueOnce(new Error('queue unavailable'));

    const failureStartedAt = new Date();
    await expect(deadlinePublisher.publishCompensationBatch()).rejects.toThrow('queue unavailable');
    const failureFinishedAt = new Date();
    const stored = await connection
      .model(CircleProposal.name)
      .findById(proposal.id)
      .select(
        '+deadlineCompensationClaimToken +deadlineCompensationClaimExpiresAt +deadlineCompensationDeliveryToken',
      );
    expect(stored).toMatchObject({
      deadlineCompensationClaimToken: null,
      deadlineCompensationClaimExpiresAt: null,
      deadlineCompensationDeliveryToken: null,
    });
    if (!stored?.deadlineCompensationDispatchAt) {
      throw new Error('补偿投递失败后没有恢复可投递时间');
    }
    expect(stored.deadlineCompensationDispatchAt.getTime()).toBeGreaterThanOrEqual(
      failureStartedAt.getTime(),
    );
    expect(stored.deadlineCompensationDispatchAt.getTime()).toBeLessThanOrEqual(
      failureFinishedAt.getTime(),
    );
  });

  it('releases the matching compensation delivery after the final worker failure', async () => {
    const proposalId = new Types.ObjectId().toString();
    const deliveryToken = crypto.randomUUID();
    jest
      .spyOn(deadlineService, 'processProposal')
      .mockRejectedValueOnce(new Error('settlement failed'));
    const releaseSpy = jest
      .spyOn(deadlineService, 'releaseFailedDelivery')
      .mockResolvedValueOnce(undefined);
    const job = {
      name: CIRCLE_PROPOSAL_DEADLINE_JOB_NAMES.ADVANCE_PROPOSAL,
      data: {
        kind: CIRCLE_PROPOSAL_DEADLINE_JOB_KINDS.ADVANCE_PROPOSAL,
        proposalId,
        deadlineVersion: 3,
        deliveryToken,
      },
      attemptsMade: CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS - 1,
      opts: { attempts: CIRCLE_PROPOSAL_DEADLINE_JOB_ATTEMPTS },
    } as Job<CircleProposalDeadlineJob>;

    await expect(deadlineProcessor.process(job)).rejects.toThrow('settlement failed');
    expect(releaseSpy).toHaveBeenCalledWith(proposalId, 3, deliveryToken);
  });

  it('makes a failed compensation delivery immediately eligible without clearing another delivery', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'failed-delivery-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const deliveryToken = crypto.randomUUID();
    const futureAt = new Date(Date.now() + 60_000);
    await connection.model(CircleProposal.name).updateOne(
      { _id: proposal.id },
      {
        $set: {
          deadlineCompensationDispatchAt: futureAt,
          deadlineCompensationClaimExpiresAt: futureAt,
          deadlineCompensationDeliveryToken: deliveryToken,
        },
      },
    );

    await deadlineService.releaseFailedDelivery(proposal.id, 1, crypto.randomUUID());
    const unchanged = await connection
      .model(CircleProposal.name)
      .findById(proposal.id)
      .select('+deadlineCompensationClaimExpiresAt +deadlineCompensationDeliveryToken');
    expect(unchanged).toMatchObject({
      deadlineCompensationDispatchAt: futureAt,
      deadlineCompensationClaimExpiresAt: futureAt,
      deadlineCompensationDeliveryToken: deliveryToken,
    });

    const releaseStartedAt = Date.now();
    await deadlineService.releaseFailedDelivery(proposal.id, 1, deliveryToken);
    const releaseFinishedAt = Date.now();
    const released = await connection
      .model(CircleProposal.name)
      .findById(proposal.id)
      .select('+deadlineCompensationClaimExpiresAt +deadlineCompensationDeliveryToken');
    expect(released).toMatchObject({
      deadlineCompensationClaimExpiresAt: null,
      deadlineCompensationDeliveryToken: null,
    });
    if (!released?.deadlineCompensationDispatchAt) {
      throw new Error('失败补偿任务没有恢复可投递时间');
    }
    expect(released.deadlineCompensationDispatchAt.getTime()).toBeGreaterThanOrEqual(
      releaseStartedAt + CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS,
    );
    expect(released.deadlineCompensationDispatchAt.getTime()).toBeLessThanOrEqual(
      releaseFinishedAt + CIRCLE_PROPOSAL_DEADLINE_COMPENSATION_RETRY_MS,
    );
  });

  it('only lets the matching governance case terminate a held proposal', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'governance-moderation-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const governanceCaseId = new Types.ObjectId().toString();
    await connection
      .model(CircleProposal.name)
      .updateOne({ _id: proposal.id }, { $set: { activeGovernanceCaseId: governanceCaseId } });

    await expect(
      service.moderateProposalFromGovernance(
        proposal.id,
        new Types.ObjectId().toString(),
        '错误案件不能终止提案。',
      ),
    ).resolves.toBe(false);
    await expect(
      service.moderateProposalFromGovernance(
        proposal.id,
        governanceCaseId,
        '治理案件确认提案违规。',
      ),
    ).resolves.toBe(true);

    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.MODERATED,
      activeGovernanceCaseId: null,
      moderationReason: '治理案件确认提案违规。',
    });
  });

  it('records when governance hides a proposal comment', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const creator = await createEligibleAgent(circle.id, 'comment-governance-creator');
    const proposal = await createVotingProposal(circle.id, creator.id);
    const comment = await connection.model(CircleProposalComment.name).create({
      circleId: circle.id,
      proposalId: proposal.id,
      revisionNumber: 1,
      authorAgentId: creator.id,
      authorOwnerUserIdSnapshot: creator.userId,
      authorAgentNameSnapshot: creator.name,
      authorAgentAvatarSeedSnapshot: creator.avatarSeed,
      content: '这条评论将由治理案件隐藏',
      idempotencyKey: crypto.randomUUID(),
      hiddenAt: null,
    });

    await expect(
      service.moderateCommentFromGovernance(
        comment.id,
        'governance-case-id',
        '评论违反当前圈子规则。',
      ),
    ).resolves.toBe(true);

    expect(
      (await connection.model(CircleProposalComment.name).findById(comment.id))?.hiddenAt,
    ).not.toBeNull();
    expect(
      await connection.model(CircleMaintenanceLog.name).findOne({
        proposalId: proposal.id,
        action: 'PROPOSAL_COMMENT_MODERATED',
      }),
    ).toMatchObject({
      publicReason: '评论违反当前圈子规则。',
      metadata: {
        governanceCaseId: 'governance-case-id',
        commentId: comment.id,
        previousStatus: 'VISIBLE',
        nextStatus: 'HIDDEN',
      },
    });
  });
});
