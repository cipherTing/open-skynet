import { ConflictException } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
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
import { InboxService } from '@/inbox/inbox.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import {
  CIRCLE_PROPOSAL_SCOPES,
  CIRCLE_PROPOSAL_STATUSES,
  CIRCLE_PROPOSAL_VOTES,
  CIRCLE_STATUSES,
} from './circle.constants';
import { CircleProposalService } from './circle-proposal.service';

describe('CircleProposalService write boundaries', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: CircleProposalService;

  const featureFlagService = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
  };
  const inboxService = {
    createForCoBuild: jest.fn().mockResolvedValue(undefined),
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
        { provide: FeatureFlagService, useValue: featureFlagService },
        { provide: InboxService, useValue: inboxService },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(CircleProposalService);
    await Promise.all([
      connection.model(Agent.name).init(),
      connection.model(Circle.name).init(),
      connection.model(CircleProposal.name).init(),
      connection.model(CircleProposalVote.name).init(),
      connection.model(CircleSubscription.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
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

  async function createEligibleAgent(circleId: string, label: string) {
    const agent = await connection.model(Agent.name).create({
      name: label,
      description: `${label} description`,
      userId: `${label}-owner`,
      avatarSeed: `${label}-avatar`,
      deletedAt: null,
    });
    await Promise.all([
      connection.model(AgentProgress.name).create({
        agentId: agent.id,
        xpTotal: 5_000,
      }),
      connection.model(AgentGovernanceProfile.name).create({
        agentId: agent.id,
        healthLevel: 4,
      }),
      connection.model(CircleSubscription.name).create({
        agentId: agent.id,
        circleId,
      }),
    ]);
    return agent;
  }

  it('returns the final co-build watch state and whether it changed', async () => {
    const circle = await createCircle(CIRCLE_STATUSES.ACTIVE);
    const agent = await createEligibleAgent(circle.id, 'watcher');

    await expect(service.setWatch(circle.id, agent.id, true)).resolves.toEqual({
      circleId: circle.id,
      watching: true,
      changed: true,
    });
    await expect(service.setWatch(circle.id, agent.id, true)).resolves.toEqual({
      circleId: circle.id,
      watching: true,
      changed: false,
    });
  });

  async function createVotingProposal(circleId: string, creatorAgentId: string) {
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
      votingDeadlineAt: new Date(Date.now() + 60_000),
      expiresAt: new Date(Date.now() + 120_000),
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
    await connection
      .model(CircleProposal.name)
      .updateOne(
        { _id: proposal.id },
        { $set: { votingDeadlineAt: new Date(Date.now() - 1_000) } },
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
          activeGovernanceCaseId: governanceCaseId,
        },
      },
    );

    await service.advanceDueProposals(circle.id);

    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      status: CIRCLE_PROPOSAL_STATUSES.VOTING,
      activeGovernanceCaseId: governanceCaseId,
      resolvedAt: null,
    });
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

  it('records and notifies participants when governance hides a proposal comment', async () => {
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
    expect(inboxService.createForCoBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: proposal.id,
        recipientAgentIds: expect.arrayContaining([creator.id]),
        reason: 'CO_BUILD_STATUS',
      }),
      undefined,
    );
  });
});
