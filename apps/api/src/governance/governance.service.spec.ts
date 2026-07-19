import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DatabaseService } from '@/database/database.service';
import { GovernanceService } from './governance.service';
import { ProgressionService } from '@/progression/progression.service';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { PostRevision, PostRevisionSchema } from '@/database/schemas/post-revision.schema';
import { ReplyRevision, ReplyRevisionSchema } from '@/database/schemas/reply-revision.schema';
import {
  GovernanceAssignment,
  GovernanceAssignmentSchema,
} from '@/database/schemas/governance-assignment.schema';
import { GovernanceCase, GovernanceCaseSchema } from '@/database/schemas/governance-case.schema';
import {
  ReportTargetState,
  ReportTargetStateSchema,
} from '@/database/schemas/report-target-state.schema';
import {
  GovernanceDailyQuota,
  GovernanceDailyQuotaSchema,
} from '@/database/schemas/governance-daily-quota.schema';
import { GovernanceVote, GovernanceVoteSchema } from '@/database/schemas/governance-vote.schema';
import {
  AgentGovernanceProfile,
  AgentGovernanceProfileSchema,
} from '@/database/schemas/agent-governance-profile.schema';
import { AgentProgress, AgentProgressSchema } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent, AgentXpEventSchema } from '@/database/schemas/agent-xp-event.schema';
import { FeatureFlag, FeatureFlagSchema } from '@/database/schemas/feature-flag.schema';
import {
  CircleRuleRevision,
  CircleRuleRevisionSchema,
} from '@/database/schemas/circle-rule-revision.schema';
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import { CircleProposal, CircleProposalSchema } from '@/database/schemas/circle-proposal.schema';
import {
  CircleProposalComment,
  CircleProposalCommentSchema,
} from '@/database/schemas/circle-proposal-comment.schema';
import {
  CircleProposalRevision,
  CircleProposalRevisionSchema,
} from '@/database/schemas/circle-proposal-revision.schema';
import {
  GOVERNANCE_ASSIGNMENT_STATUS,
  GOVERNANCE_CASE_STATUS,
  GOVERNANCE_DECISIONS,
  GOVERNANCE_ERROR_CODES,
  GOVERNANCE_HEALTH_LEVEL,
  GOVERNANCE_TARGET_TYPES,
} from './governance.constants';
import { FeatureFlagService } from '@/system/feature-flag.service';
import {
  GovernanceCorrection,
  GovernanceCorrectionSchema,
} from '@/database/schemas/governance-correction.schema';
import {
  AgentGovernanceHistory,
  AgentGovernanceHistorySchema,
} from '@/database/schemas/agent-governance-history.schema';
import { CircleProposalService } from '@/circle/circle-proposal.service';
import { InboxService } from '@/inbox/inbox.service';
import { getReportTargetKey, REPORT_TARGET_STATUSES } from '@/report/report.constants';

let sequence = 0;
const TEST_CIRCLE_ID = '64f000000000000000000001';

describe('GovernanceService integration', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: GovernanceService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: Post.name, schema: PostSchema },
          { name: PostRevision.name, schema: PostRevisionSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: ReplyRevision.name, schema: ReplyRevisionSchema },
          { name: GovernanceAssignment.name, schema: GovernanceAssignmentSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: ReportTargetState.name, schema: ReportTargetStateSchema },
          { name: GovernanceDailyQuota.name, schema: GovernanceDailyQuotaSchema },
          { name: GovernanceVote.name, schema: GovernanceVoteSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentXpEvent.name, schema: AgentXpEventSchema },
          { name: FeatureFlag.name, schema: FeatureFlagSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: CircleProposal.name, schema: CircleProposalSchema },
          { name: CircleProposalComment.name, schema: CircleProposalCommentSchema },
          { name: CircleProposalRevision.name, schema: CircleProposalRevisionSchema },
          { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
          { name: GovernanceCorrection.name, schema: GovernanceCorrectionSchema },
          { name: AgentGovernanceHistory.name, schema: AgentGovernanceHistorySchema },
        ]),
      ],
      providers: [
        GovernanceService,
        ProgressionService,
        DatabaseService,
        FeatureFlagService,
        {
          provide: CircleProposalService,
          useValue: {
            moderateProposalFromGovernance: jest.fn().mockResolvedValue(true),
            moderateCommentFromGovernance: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: InboxService,
          useValue: { createForGovernanceCase: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(GovernanceService);
    await connection.model(CircleRuleRevision.name).insertMany([
      {
        circleId: TEST_CIRCLE_ID,
        version: 1,
        rules: [{ id: 'rule-friendly', text: '友好交流，不破坏社区' }],
        source: 'SYSTEM',
        actorAgentId: null,
      },
      {
        circleId: TEST_CIRCLE_ID,
        version: 2,
        rules: [{ id: 'rule-context', text: '回复时尊重讨论上下文' }],
        source: 'AGENT',
        actorAgentId: null,
      },
      {
        circleId: TEST_CIRCLE_ID,
        version: 3,
        rules: [{ id: 'rule-sabotage', text: '不得发布破坏社区的内容' }],
        source: 'AGENT',
        actorAgentId: null,
      },
    ]);
  });

  beforeEach(async () => {
    const now = new Date();
    await connection.model(GovernanceCase.name).updateMany(
      { status: { $in: [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY] } },
      {
        $set: {
          status: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
          resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
          resolvedAt: now,
        },
      },
    );
    await connection.model(GovernanceAssignment.name).updateMany(
      { status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE },
      {
        $set: {
          status: GOVERNANCE_ASSIGNMENT_STATUS.CASE_CLOSED,
          statusReason: 'test-isolation',
          decidedAt: now,
        },
      },
    );
    await connection
      .model(ReportTargetState.name)
      .updateMany(
        { status: REPORT_TARGET_STATUSES.CASE_OPEN },
        { $set: { status: REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION } },
      );
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
    if (replicaSet) await replicaSet.stop();
  });

  async function createAgent(name: string, xpTotal = 0, ownerUserId?: string) {
    sequence += 1;
    const uniqueName = `${name}-${sequence}`;
    const agent = await connection.model(Agent.name).create({
      name: uniqueName,
      description: `${name} description`,
      userId: ownerUserId ?? `${uniqueName}-user`,
    });
    await connection.model(AgentProgress.name).create({
      agentId: agent.id,
      xpTotal,
      staminaCurrent: 100,
      staminaLastSettledAt: new Date(),
      dailyProgressDate: '2026-05-14',
      dailyCounters: {},
      awardedDailyTaskIds: [],
    });
    return agent;
  }

  async function createReporterAgents(prefix: string) {
    return Promise.all(
      Array.from({ length: 3 }, (_, index) => createAgent(`${prefix}-${index}`, 5000)),
    );
  }

  async function createPost(data: {
    title: string;
    content: string;
    authorId: string;
    replyCount?: number;
  }) {
    const post = await connection.model(Post.name).create({
      title: data.title,
      content: data.content,
      tags: ['DISCUSSION'],
      contentVersion: 1,
      lastEditedAt: null,
      authorId: data.authorId,
      circleId: TEST_CIRCLE_ID,
      circleRulesVersion: 1,
      feedbackCounts: {},
      viewCount: 0,
      replyCount: data.replyCount ?? 0,
    });
    await connection.model(PostRevision.name).create({
      postId: post.id,
      version: 1,
      title: post.title,
      content: post.content,
      tags: post.tags,
      authorId: post.authorId,
    });
    return post;
  }

  async function createViolationCase() {
    const author = await createAgent('author');
    const post = await createPost({
      title: 'bad post',
      content: 'bad content',
      authorId: author.id,
    });
    const reporters = await createReporterAgents(`reporter-${post.id}`);
    const governanceCase = await service.openCaseFromReports({
      targetType: GOVERNANCE_TARGET_TYPES.POST,
      targetId: post.id,
      targetContentVersion: 1,
      round: 1,
      reporters: reporters.map((reporter) => ({
        agentId: reporter.id,
        ownerUserId: reporter.userId,
      })),
    });
    await connection.model(ReportTargetState.name).create({
      targetKey: getReportTargetKey(GOVERNANCE_TARGET_TYPES.POST, post.id, 1, 1),
      targetType: GOVERNANCE_TARGET_TYPES.POST,
      targetId: post.id,
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: author.id,
      qualifiedReporters: reporters.map((reporter) => ({
        agentId: reporter.id,
        ownerUserId: reporter.userId,
      })),
      status: REPORT_TARGET_STATUSES.CASE_OPEN,
      caseId: governanceCase.id,
    });
    return { author, post, governanceCase, reporters };
  }

  async function createProposalGovernanceCase() {
    const author = await createAgent('proposal-author');
    const reporters = await createReporterAgents('proposal-reporters');
    const circleId = new Types.ObjectId().toString();
    const proposal = await connection.model(CircleProposal.name).create({
      circleId,
      scope: 'TOPIC',
      status: 'DISCUSSION',
      creatorAgentId: author.id,
      creatorOwnerUserIdSnapshot: author.userId,
      creatorAgentNameSnapshot: author.name,
      creatorAgentAvatarSeedSnapshot: author.avatarSeed,
      baseVersion: 1,
      baseTopicSnapshot: '原圈子简介',
      baseRulesSnapshot: null,
      currentRevisionNumber: 1,
      eligibleMemberCountSnapshot: 3,
      quorumSnapshot: 3,
      version: 1,
      participationVersion: 0,
      discussionDeadlineAt: new Date(Date.now() + 60_000),
      votingDeadlineAt: null,
      expiresAt: new Date(Date.now() + 120_000),
      resolvedAt: null,
      moderationReason: null,
      approveCount: 0,
      rejectCount: 0,
      activeKey: `${circleId}:TOPIC`,
      activeGovernanceCaseId: null,
      idempotencyKey: crypto.randomUUID(),
    });
    await connection.model(CircleProposalRevision.name).create({
      circleId,
      proposalId: proposal.id,
      revisionNumber: 1,
      authorAgentId: author.id,
      authorOwnerUserIdSnapshot: author.userId,
      reason: '更新圈子简介',
      topicSnapshot: '新的圈子简介',
      rulesSnapshot: null,
      idempotencyKey: crypto.randomUUID(),
    });
    const governanceCase = await service.openCaseFromReports({
      targetType: GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL,
      targetId: proposal.id,
      targetContentVersion: 1,
      round: 1,
      reporters: reporters.map((reporter) => ({
        agentId: reporter.id,
        ownerUserId: reporter.userId,
      })),
    });
    await connection.model(ReportTargetState.name).create({
      targetKey: getReportTargetKey(GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL, proposal.id, 1, 1),
      targetType: GOVERNANCE_TARGET_TYPES.CIRCLE_PROPOSAL,
      targetId: proposal.id,
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: author.id,
      qualifiedReporters: reporters.map((reporter) => ({
        agentId: reporter.id,
        ownerUserId: reporter.userId,
      })),
      status: REPORT_TARGET_STATUSES.CASE_OPEN,
      caseId: governanceCase.id,
    });
    return { proposal, governanceCase };
  }

  it('creates structured post snapshots when opening a governance case', async () => {
    const { governanceCase } = await createViolationCase();
    expect(governanceCase.targetSnapshot.kind).toBe('POST');
    if (governanceCase.targetSnapshot.kind !== 'POST') throw new Error('expected post snapshot');
    expect(governanceCase.targetSnapshot.post.title).toBe('bad post');
    expect(governanceCase.targetSnapshot.post.content).toBe('bad content');
    expect(governanceCase.targetSnapshot.post.authorId).toBe(governanceCase.targetAuthorId);
    expect(governanceCase.targetSnapshot.post.circleRules).toEqual({
      circleId: TEST_CIRCLE_ID,
      version: 1,
      rules: [{ id: 'rule-friendly', text: '友好交流，不破坏社区' }],
    });
  });

  it('locks an active proposal while it is reviewed and releases it after a not-violation result', async () => {
    const { proposal, governanceCase } = await createProposalGovernanceCase();
    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      activeGovernanceCaseId: governanceCase.id,
      status: 'DISCUSSION',
    });

    const session = await connection.startSession();
    try {
      await session.withTransaction(async () => {
        await service.resolveCaseForAdmin(
          governanceCase.id,
          'NOT_VIOLATION',
          '管理员确认该提案没有违反社区规则。',
          'admin-user-id',
          session,
        );
      });
    } finally {
      await session.endSession();
    }

    expect(await connection.model(CircleProposal.name).findById(proposal.id)).toMatchObject({
      activeGovernanceCaseId: null,
      status: 'DISCUSSION',
    });
  });

  it('creates structured reply snapshots with post and parent reply context', async () => {
    const postAuthor = await createAgent('reply-post-author');
    const replyAuthor = await createAgent('reply-author');
    const parentAuthor = await createAgent('parent-author');
    const post = await createPost({
      title: 'thread title',
      content: 'thread root content',
      authorId: postAuthor.id,
      replyCount: 2,
    });
    const parentReply = await connection.model(Reply.name).create({
      postId: post.id,
      parentReplyId: null,
      content: 'parent reply content',
      authorId: parentAuthor.id,
      feedbackCounts: {},
      circleRulesVersion: 2,
      contentVersion: 1,
      lastEditedAt: null,
    });
    const reply = await connection.model(Reply.name).create({
      postId: post.id,
      parentReplyId: parentReply.id,
      content: 'child reply content',
      authorId: replyAuthor.id,
      feedbackCounts: {},
      circleRulesVersion: 3,
      contentVersion: 1,
      lastEditedAt: null,
    });
    await connection.model(ReplyRevision.name).insertMany([
      {
        replyId: parentReply.id,
        postId: post.id,
        version: 1,
        content: parentReply.content,
        authorId: parentReply.authorId,
      },
      {
        replyId: reply.id,
        postId: post.id,
        version: 1,
        content: reply.content,
        authorId: reply.authorId,
      },
    ]);
    const reporters = await createReporterAgents(`reply-reporter-${reply.id}`);
    const governanceCase = await service.openCaseFromReports({
      targetType: GOVERNANCE_TARGET_TYPES.REPLY,
      targetId: reply.id,
      targetContentVersion: 1,
      round: 1,
      reporters: reporters.map((reporter) => ({
        agentId: reporter.id,
        ownerUserId: reporter.userId,
      })),
    });

    expect(governanceCase.targetSnapshot.kind).toBe('REPLY');
    if (governanceCase.targetSnapshot.kind !== 'REPLY') throw new Error('expected reply snapshot');
    expect(governanceCase.targetSnapshot.post.title).toBe('thread title');
    expect(governanceCase.targetSnapshot.post.content).toBe('thread root content');
    expect(governanceCase.targetSnapshot.reply.content).toBe('child reply content');
    expect(governanceCase.targetSnapshot.parentReply?.content).toBe('parent reply content');
    expect(governanceCase.targetSnapshot.post.circleRules).toMatchObject({
      version: 1,
      rules: [{ id: 'rule-friendly', text: '友好交流，不破坏社区' }],
    });
    expect(governanceCase.targetSnapshot.parentReply?.circleRules).toMatchObject({
      version: 2,
      rules: [{ id: 'rule-context', text: '回复时尊重讨论上下文' }],
    });
    expect(governanceCase.targetSnapshot.reply.circleRules).toMatchObject({
      version: 3,
      rules: [{ id: 'rule-sabotage', text: '不得发布破坏社区的内容' }],
    });
    expect(governanceCase.targetAuthorId).toBe(replyAuthor.id);
  });

  it('returns public detail with structured snapshot and vote counts, not weights or trigger scores', async () => {
    const { governanceCase } = await createViolationCase();
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      status: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
      resolution: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
      resolvedAt: new Date(),
      violationTally: 3.5,
      notViolationTally: 1,
    });

    const detail = await service.getResultDetail(governanceCase.id);
    expect(detail.result).toBe('violation');
    expect(detail.tally).toEqual({ violation: 3.5, notViolation: 1 });
    expect(detail.targetSnapshot.kind).toBe('POST');
    expect(detail.timelineEvents.map((event) => event.type)).toContain('CASE_OPENED');
    expect(detail.timelineEvents.map((event) => event.type)).toContain('CASE_RESOLVED');
    expect(detail).not.toHaveProperty('violationWeight');
    expect(detail).not.toHaveProperty('triggerScore');
    expect(detail).not.toHaveProperty('reporterAgentIds');
    expect(detail).not.toHaveProperty('reporterOwnerUserIds');
    expect(detail).not.toHaveProperty('targetAuthorOwnerUserId');
  });

  it('aggregates timeline vote events by meaningful voting day with decimal tallies', async () => {
    const { governanceCase } = await createViolationCase();
    const dayOne = new Date('2026-05-20T02:00:00.000Z');
    const dayTwo = new Date('2026-05-22T03:00:00.000Z');
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      openedAt: new Date('2026-05-20T01:00:00.000Z'),
      status: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
      resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
      resolvedAt: new Date('2026-05-22T05:00:00.000Z'),
      violationTally: 2.5,
      notViolationTally: 1.5,
    });
    await connection.model(GovernanceVote.name).insertMany([
      {
        caseId: governanceCase.id,
        voterAgentId: 'v1',
        voterOwnerUserIdSnapshot: 'owner-v1',
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        choice: GOVERNANCE_DECISIONS.VIOLATION,
        weight: 1,
        voterLevel: 4,
        voterHealthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
        createdAt: dayOne,
        updatedAt: dayOne,
      },
      {
        caseId: governanceCase.id,
        voterAgentId: 'v2',
        voterOwnerUserIdSnapshot: 'owner-v2',
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        choice: GOVERNANCE_DECISIONS.VIOLATION,
        weight: 1.5,
        voterLevel: 5,
        voterHealthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
        createdAt: new Date('2026-05-20T04:00:00.000Z'),
        updatedAt: new Date('2026-05-20T04:00:00.000Z'),
      },
      {
        caseId: governanceCase.id,
        voterAgentId: 'v3',
        voterOwnerUserIdSnapshot: 'owner-v3',
        targetType: governanceCase.targetType,
        targetId: governanceCase.targetId,
        choice: GOVERNANCE_DECISIONS.NOT_VIOLATION,
        weight: 1.5,
        voterLevel: 5,
        voterHealthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
        createdAt: dayTwo,
        updatedAt: dayTwo,
      },
    ]);

    const detail = await service.getResultDetail(governanceCase.id);
    const voteEvents = detail.timelineEvents.filter((event) => event.type === 'VOTES_CAST');
    expect(voteEvents).toHaveLength(2);
    expect(voteEvents[0]).toMatchObject({
      voterCount: 2,
      violation: { voterCount: 2, votes: 2.5 },
      notViolation: { voterCount: 0, votes: 0 },
    });
    expect(voteEvents[1]).toMatchObject({
      voterCount: 1,
      violation: { voterCount: 0, votes: 0 },
      notViolation: { voterCount: 1, votes: 1.5 },
    });
  });

  it('returns not found for invalid public result detail ids', async () => {
    await expect(service.getResultDetail('not-a-valid-object-id')).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.CASE_NOT_FOUND }),
    });
  });

  it('records one public tally value per decision side, allowing decimals', async () => {
    await createViolationCase();
    const violationJudge = await createAgent('violation-judge', 600000);
    const notViolationJudge = await createAgent('not-violation-judge', 600000);

    const first = await service.dispatchNextCase(violationJudge.id);
    await service.submitDecision(violationJudge.id, first.case.id, GOVERNANCE_DECISIONS.VIOLATION);
    const second = await service.dispatchNextCase(notViolationJudge.id);
    await service.submitDecision(
      notViolationJudge.id,
      second.case.id,
      GOVERNANCE_DECISIONS.NOT_VIOLATION,
    );

    const updated = await connection.model(GovernanceCase.name).findById(first.case.id);
    expect(updated?.violationTally).toBeGreaterThan(1);
    expect(updated?.notViolationTally).toBeGreaterThan(1);
    expect(updated).not.toHaveProperty('violationVoteCount');
    expect(updated).not.toHaveProperty('notViolationVoteCount');
  });

  it('stores a private snapshot of at least three unique reporters', async () => {
    const author = await createAgent('author');
    const post = await createPost({
      title: 'reported post',
      content: 'content',
      authorId: author.id,
    });
    const reporters = await createReporterAgents('private-reporters');
    const reporterAgentIds = reporters.map((reporter) => reporter.id);
    const reporterOwnerUserIds = reporters.map((reporter) => reporter.userId);
    const created = await service.openCaseFromReports({
      targetType: GOVERNANCE_TARGET_TYPES.POST,
      targetId: post.id,
      targetContentVersion: 1,
      round: 1,
      reporters: reporters.map((reporter) => ({
        agentId: reporter.id,
        ownerUserId: reporter.userId,
      })),
    });

    expect(created.triggerScore).toBe(3);
    expect(created.triggerThreshold).toBe(3);
    const defaultSelection = await connection
      .model(GovernanceCase.name)
      .findById(created.id)
      .lean();
    expect(defaultSelection).not.toHaveProperty('reporterAgentIds');
    expect(defaultSelection).not.toHaveProperty('reporterOwnerUserIds');
    expect(defaultSelection).not.toHaveProperty('targetAuthorOwnerUserId');
    const privateSelection = await connection
      .model(GovernanceCase.name)
      .findById(created.id)
      .select('+reporterAgentIds +reporterOwnerUserIds +targetAuthorOwnerUserId')
      .lean<{
        reporterAgentIds: string[];
        reporterOwnerUserIds: string[];
        targetAuthorOwnerUserId: string;
      }>();
    expect(privateSelection?.reporterAgentIds).toEqual(reporterAgentIds);
    expect(privateSelection?.reporterOwnerUserIds).toEqual(reporterOwnerUserIds);
    expect(privateSelection?.targetAuthorOwnerUserId).toBe(author.userId);
  });

  it('rejects fewer than three unique reporters and the target author in reporter snapshots', async () => {
    const author = await createAgent('author');
    const reporters = await createReporterAgents('invalid-reporters');
    const post = await createPost({
      title: 'reported post',
      content: 'content',
      authorId: author.id,
    });

    await expect(
      service.openCaseFromReports({
        targetType: GOVERNANCE_TARGET_TYPES.POST,
        targetId: post.id,
        targetContentVersion: 1,
        round: 1,
        reporters: [reporters[0], reporters[0], reporters[1]].map((reporter) => ({
          agentId: reporter.id,
          ownerUserId: reporter.userId,
        })),
      }),
    ).rejects.toThrow('at least three unique Agents and owners');
    await expect(
      service.openCaseFromReports({
        targetType: GOVERNANCE_TARGET_TYPES.POST,
        targetId: post.id,
        targetContentVersion: 1,
        round: 1,
        reporters: [author, reporters[0], reporters[1]].map((reporter) => ({
          agentId: reporter.id,
          ownerUserId: reporter.userId,
        })),
      }),
    ).rejects.toThrow('target author Agent or owner');
  });

  it('rejects three Agents that claim the same owner', async () => {
    const author = await createAgent('same-owner-author');
    const reporters = await createReporterAgents('same-owner-reporters');
    const post = await createPost({
      title: 'same owner report attempt',
      content: 'content',
      authorId: author.id,
    });

    await expect(
      service.openCaseFromReports({
        targetType: GOVERNANCE_TARGET_TYPES.POST,
        targetId: post.id,
        targetContentVersion: 1,
        round: 1,
        reporters: reporters.map((reporter) => ({
          agentId: reporter.id,
          ownerUserId: reporters[0].userId,
        })),
      }),
    ).rejects.toThrow('at least three unique Agents and owners');
  });

  it('verifies historical owners even after reporter and author Agents are deleted', async () => {
    const author = await createAgent('deleted-owner-author');
    const reporters = await createReporterAgents('deleted-owner-reporters');
    const post = await createPost({
      title: 'historical owner verification',
      content: 'content',
      authorId: author.id,
    });
    await connection
      .model(Agent.name)
      .updateMany(
        { _id: { $in: [author.id, reporters[0].id] } },
        { $set: { deletedAt: new Date() } },
      );

    const governanceCase = await service.openCaseFromReports({
      targetType: GOVERNANCE_TARGET_TYPES.POST,
      targetId: post.id,
      targetContentVersion: 1,
      round: 1,
      reporters: reporters.map((reporter) => ({
        agentId: reporter.id,
        ownerUserId: reporter.userId,
      })),
    });
    const privateCase = await connection
      .model(GovernanceCase.name)
      .findById(governanceCase.id)
      .select('+reporterOwnerUserIds +targetAuthorOwnerUserId');
    expect(privateCase?.reporterOwnerUserIds).toEqual(reporters.map((reporter) => reporter.userId));
    expect(privateCase?.targetAuthorOwnerUserId).toBe(author.userId);

    const authorReplacement = await createAgent('deleted-author-replacement', 5000, author.userId);
    await expect(service.dispatchNextCase(authorReplacement.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.NO_AVAILABLE_CASE }),
    });
  });

  it('keeps Agent ownership immutable', async () => {
    const agent = await createAgent('immutable-owner');
    const originalOwnerUserId = agent.userId;

    await connection
      .model(Agent.name)
      .updateOne({ _id: agent.id }, { $set: { userId: 'different-owner' } });

    const unchanged = await connection.model(Agent.name).findById(agent.id);
    expect(unchanged?.userId).toBe(originalOwnerUserId);
  });

  it('blocks a second dispatch while the agent has one active assignment', async () => {
    await createViolationCase();
    const judge = await createAgent('judge', 5000);

    const first = await service.dispatchNextCase(judge.id);
    expect(first.case.id).toBeTruthy();

    await expect(service.dispatchNextCase(judge.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.ACTIVE_CASE_EXISTS }),
    });
  });

  it('never dispatches a case to one of its reporters', async () => {
    const { reporters } = await createViolationCase();

    await expect(service.dispatchNextCase(reporters[0].id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.NO_AVAILABLE_CASE }),
    });
  });

  it('closes an invalid reporter assignment before rejecting its decision', async () => {
    const { governanceCase, reporters } = await createViolationCase();
    const reporter = reporters[0];
    await connection.model(GovernanceAssignment.name).create({
      caseId: governanceCase.id,
      agentId: reporter.id,
      agentOwnerUserIdSnapshot: reporter.userId,
      status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE,
      decision: null,
      weight: 0,
      agentLevelSnapshot: 4,
      healthLevelSnapshot: GOVERNANCE_HEALTH_LEVEL.GOOD,
      assignedAt: new Date(),
      deadlineAt: governanceCase.emergencyDeadlineAt,
    });

    await expect(
      service.submitDecision(reporter.id, governanceCase.id, GOVERNANCE_DECISIONS.VIOLATION),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.NOT_ELIGIBLE }),
    });

    const [assignment, vote, quota] = await Promise.all([
      connection.model(GovernanceAssignment.name).findOne({
        caseId: governanceCase.id,
        agentId: reporter.id,
      }),
      connection.model(GovernanceVote.name).findOne({
        caseId: governanceCase.id,
        voterAgentId: reporter.id,
      }),
      connection.model(GovernanceDailyQuota.name).findOne({ agentId: reporter.id }),
    ]);
    expect(assignment?.status).toBe(GOVERNANCE_ASSIGNMENT_STATUS.CASE_CLOSED);
    expect(assignment?.statusReason).toBe('reporter-ineligible');
    expect(vote).toBeNull();
    expect(quota).toBeNull();
  });

  it('blocks a replacement Agent owned by the same reporter from dispatch and submission', async () => {
    const { governanceCase, reporters } = await createViolationCase();
    const originalReporter = reporters[0];
    await connection
      .model(Agent.name)
      .updateOne({ _id: originalReporter.id }, { $set: { deletedAt: new Date() } });
    const replacement = await createAgent(
      'reporter-owner-replacement',
      5000,
      originalReporter.userId,
    );

    await expect(service.dispatchNextCase(replacement.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.NO_AVAILABLE_CASE }),
    });

    await connection.model(GovernanceAssignment.name).create({
      caseId: governanceCase.id,
      agentId: replacement.id,
      agentOwnerUserIdSnapshot: replacement.userId,
      status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE,
      decision: null,
      weight: 0,
      agentLevelSnapshot: 4,
      healthLevelSnapshot: GOVERNANCE_HEALTH_LEVEL.GOOD,
      assignedAt: new Date(),
      deadlineAt: governanceCase.emergencyDeadlineAt,
    });
    await expect(
      service.submitDecision(replacement.id, governanceCase.id, GOVERNANCE_DECISIONS.VIOLATION),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.NOT_ELIGIBLE }),
    });

    const assignment = await connection.model(GovernanceAssignment.name).findOne({
      caseId: governanceCase.id,
      agentId: replacement.id,
    });
    expect(assignment?.status).toBe(GOVERNANCE_ASSIGNMENT_STATUS.CASE_CLOSED);
    expect(assignment?.statusReason).toBe('reporter-ineligible');
  });

  it('does not let a replacement Agent owned by a previous judge review the same case twice', async () => {
    const firstCase = await createViolationCase();
    const judge = await createAgent('owner-history-judge', 5000);
    const firstAssignment = await service.dispatchNextCase(judge.id);
    expect(firstAssignment.case.id).toBe(firstCase.governanceCase.id);
    await service.submitDecision(
      judge.id,
      firstCase.governanceCase.id,
      GOVERNANCE_DECISIONS.NOT_VIOLATION,
    );
    await connection
      .model(Agent.name)
      .updateOne({ _id: judge.id }, { $set: { deletedAt: new Date() } });
    const replacement = await createAgent('owner-history-replacement', 5000, judge.userId);
    const secondCase = await createViolationCase();

    const replacementAssignment = await service.dispatchNextCase(replacement.id);
    expect(replacementAssignment.case.id).toBe(secondCase.governanceCase.id);
    expect(replacementAssignment.case.id).not.toBe(firstCase.governanceCase.id);

    await expect(
      connection.model(GovernanceVote.name).create({
        caseId: firstCase.governanceCase.id,
        voterAgentId: replacement.id,
        voterOwnerUserIdSnapshot: replacement.userId,
        targetType: firstCase.governanceCase.targetType,
        targetId: firstCase.governanceCase.targetId,
        choice: GOVERNANCE_DECISIONS.VIOLATION,
        weight: 1,
        voterLevel: 4,
        voterHealthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('persists assignment closure before rejecting a decision for a closed case', async () => {
    const { governanceCase } = await createViolationCase();
    const judge = await createAgent('closed-case-judge', 5000);
    await connection.model(GovernanceAssignment.name).create({
      caseId: governanceCase.id,
      agentId: judge.id,
      agentOwnerUserIdSnapshot: judge.userId,
      status: GOVERNANCE_ASSIGNMENT_STATUS.ACTIVE,
      decision: null,
      weight: 0,
      agentLevelSnapshot: 4,
      healthLevelSnapshot: GOVERNANCE_HEALTH_LEVEL.GOOD,
      assignedAt: new Date(),
      deadlineAt: governanceCase.emergencyDeadlineAt,
    });
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      status: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
      resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
      resolvedAt: new Date(),
    });

    await expect(
      service.submitDecision(judge.id, governanceCase.id, GOVERNANCE_DECISIONS.NOT_VIOLATION),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.CASE_NOT_FOUND }),
    });

    const assignment = await connection.model(GovernanceAssignment.name).findOne({
      caseId: governanceCase.id,
      agentId: judge.id,
    });
    expect(assignment?.status).toBe(GOVERNANCE_ASSIGNMENT_STATUS.CASE_CLOSED);
    expect(assignment?.statusReason).toBe('case-closed');
  });

  it('records an immutable governance vote snapshot after submitting a decision', async () => {
    await createViolationCase();
    const judge = await createAgent('judge', 5000);

    const dispatched = await service.dispatchNextCase(judge.id);
    await service.submitDecision(judge.id, dispatched.case.id, GOVERNANCE_DECISIONS.NOT_VIOLATION);

    const vote = await connection
      .model(GovernanceVote.name)
      .findOne({
        caseId: dispatched.case.id,
        voterAgentId: judge.id,
      })
      .lean<{ choice?: string; weight?: number; voterLevel?: number; voterHealthLevel?: number }>();
    expect(vote?.choice).toBe(GOVERNANCE_DECISIONS.NOT_VIOLATION);
    expect(vote?.weight).toBeGreaterThan(0);
    expect(vote?.voterLevel).toBeGreaterThanOrEqual(4);
    expect(vote?.voterHealthLevel).toBe(GOVERNANCE_HEALTH_LEVEL.GOOD);
  });

  it('does not auto-abstain or consume quota for an active assignment without explicit decision', async () => {
    await createViolationCase();
    const judge = await createAgent('judge', 5000);
    const dispatched = await service.dispatchNextCase(judge.id);

    await expect(service.dispatchNextCase(judge.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: GOVERNANCE_ERROR_CODES.ACTIVE_CASE_EXISTS }),
    });

    const current = await service.getCurrentAssignment(judge.id);
    expect(current?.case.id).toBe(dispatched.case.id);

    const vote = await connection.model(GovernanceVote.name).findOne({
      caseId: dispatched.case.id,
      voterAgentId: judge.id,
    });
    expect(vote).toBeNull();

    const quota = await connection.model(GovernanceDailyQuota.name).findOne({ agentId: judge.id });
    expect(quota?.quotaUsed).toBe(0);
  });

  it('allows another dispatch after submitting a decision', async () => {
    const firstCase = await createViolationCase();
    const judge = await createAgent('judge', 5000);

    const first = await service.dispatchNextCase(judge.id);
    const result = await service.submitDecision(
      judge.id,
      first.case.id,
      GOVERNANCE_DECISIONS.NOT_VIOLATION,
    );
    expect(result.assignment.status).toBe(GOVERNANCE_ASSIGNMENT_STATUS.SUBMITTED);

    const secondCase = await createViolationCase();
    const second = await service.dispatchNextCase(judge.id);
    expect(second.case.id).not.toBe(firstCase.governanceCase.id);
    expect(second.case.id).toBe(secondCase.governanceCase.id);
  });

  it('does not resolve immediately after votes; resolves violation at scheduled 8h review', async () => {
    const { author, post, governanceCase } = await createViolationCase();
    const judges = [];
    for (let index = 0; index < 2; index += 1) {
      judges.push(await createAgent('judge', 600000));
    }

    for (const judge of judges) {
      const dispatched = await service.dispatchNextCase(judge.id);
      expect(dispatched.case.id).toBe(governanceCase.id);
      const result = await service.submitDecision(
        judge.id,
        governanceCase.id,
        GOVERNANCE_DECISIONS.VIOLATION,
      );
      expect(result.case.status).toBe(GOVERNANCE_CASE_STATUS.OPEN);
    }

    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      firstReviewAt: new Date(Date.now() - 1000),
    });
    await service.advanceDeadlines();

    const [resolved, reportState] = await Promise.all([
      connection.model(GovernanceCase.name).findById(governanceCase.id),
      connection.model(ReportTargetState.name).findOne({ caseId: governanceCase.id }),
    ]);
    expect(resolved?.status).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION);
    expect(reportState?.status).toBe(REPORT_TARGET_STATUSES.RESOLVED_VIOLATION);

    const hiddenPost = await connection
      .model(Post.name)
      .findOne({ _id: post.id, deletedAt: { $ne: null } })
      .lean<{ deletedAt?: Date | null }>();
    expect(hiddenPost?.deletedAt).toBeTruthy();

    const profile = await connection
      .model(AgentGovernanceProfile.name)
      .findOne({ agentId: author.id })
      .lean<{ healthLevel?: number }>();
    expect(profile?.healthLevel).toBe(GOVERNANCE_HEALTH_LEVEL.WARNING);
  });

  it('does not remove a newer clean content version when an older version is resolved as violation', async () => {
    const { author, post, governanceCase } = await createViolationCase();
    await Promise.all([
      connection.model(Post.name).findByIdAndUpdate(post.id, {
        content: 'clean replacement content',
        contentVersion: 2,
        lastEditedAt: new Date(),
      }),
      connection.model(PostRevision.name).create({
        postId: post.id,
        version: 2,
        title: post.title,
        content: 'clean replacement content',
        tags: post.tags,
        authorId: post.authorId,
      }),
      connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
        violationTally: 6,
        notViolationTally: 0,
        firstReviewAt: new Date(Date.now() - 1000),
      }),
    ]);

    await service.advanceDeadlines();

    const [resolved, currentPost, profile] = await Promise.all([
      connection.model(GovernanceCase.name).findById(governanceCase.id),
      connection.model(Post.name).findById(post.id),
      connection.model(AgentGovernanceProfile.name).findOne({ agentId: author.id }),
    ]);
    expect(resolved?.status).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION);
    expect(currentPost?.contentVersion).toBe(2);
    expect(currentPost?.deletedAt).toBeNull();
    expect(profile?.healthLevel).toBe(GOVERNANCE_HEALTH_LEVEL.WARNING);
  });

  it('resolves one case only once when two scheduler instances race', async () => {
    const { author, governanceCase } = await createViolationCase();
    await connection.model(AgentGovernanceProfile.name).create({
      agentId: author.id,
      healthLevel: GOVERNANCE_HEALTH_LEVEL.WARNING,
      violationCount: 0,
    });
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      violationTally: 6,
      notViolationTally: 0,
      firstReviewAt: new Date(Date.now() - 1000),
    });

    await Promise.all([service.advanceDeadlines(), service.advanceDeadlines()]);

    const [resolvedCase, profile, penaltyCount] = await Promise.all([
      connection.model(GovernanceCase.name).findById(governanceCase.id),
      connection.model(AgentGovernanceProfile.name).findOne({ agentId: author.id }),
      connection.model(AgentXpEvent.name).countDocuments({
        agentId: author.id,
        sourceType: 'GOVERNANCE_PENALTY',
        sourceId: governanceCase.id,
      }),
    ]);
    expect(resolvedCase?.status).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION);
    expect(profile?.violationCount).toBe(1);
    expect(profile?.healthLevel).toBe(GOVERNANCE_HEALTH_LEVEL.PENALIZED);
    expect(penaltyCount).toBe(1);
  });

  it('keeps an administrator ban active while applying a new community penalty to the restore level', async () => {
    const { author, governanceCase } = await createViolationCase();
    const activeBanRecordId = new Types.ObjectId().toString();
    await connection.model(AgentGovernanceProfile.name).create({
      agentId: author.id,
      healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
      violationCount: 0,
      activeAdminBanRecordId: activeBanRecordId,
      adminBanRestoreHealthLevel: GOVERNANCE_HEALTH_LEVEL.WARNING,
    });
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      violationTally: 6,
      notViolationTally: 0,
      firstReviewAt: new Date(Date.now() - 1000),
    });

    await service.advanceDeadlines();

    const [profile, history] = await Promise.all([
      connection.model(AgentGovernanceProfile.name).findOne({ agentId: author.id }),
      connection
        .model(AgentGovernanceHistory.name)
        .findOne({ governanceCaseId: governanceCase.id }),
    ]);
    expect(profile).toMatchObject({
      healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
      activeAdminBanRecordId: activeBanRecordId,
      adminBanRestoreHealthLevel: GOVERNANCE_HEALTH_LEVEL.PENALIZED,
      violationCount: 1,
    });
    expect(history).toMatchObject({
      source: 'COMMUNITY_CASE',
      previousHealthLevel: GOVERNANCE_HEALTH_LEVEL.WARNING,
      nextHealthLevel: GOVERNANCE_HEALTH_LEVEL.PENALIZED,
    });
  });

  it('restores governance-removed content without rewriting the old case and opens a new report round', async () => {
    const { post, governanceCase } = await createViolationCase();
    const resolveSession = await connection.startSession();
    try {
      await resolveSession.withTransaction(async () => {
        await service.resolveCaseForAdmin(
          governanceCase.id,
          'VIOLATION',
          '管理员确认该内容违反当前规则。',
          'admin-user-id',
          resolveSession,
        );
      });
    } finally {
      await resolveSession.endSession();
    }

    const correctionSession = await connection.startSession();
    try {
      await correctionSession.withTransaction(async () => {
        await service.restoreGovernanceRemovedContentForAdmin(
          governanceCase.id,
          '复核后确认原裁决依据不足，恢复内容。',
          'admin-user-id',
          correctionSession,
        );
      });
    } finally {
      await correctionSession.endSession();
    }

    const [storedCase, restoredPost, oldState, nextState, correction] = await Promise.all([
      connection.model(GovernanceCase.name).findById(governanceCase.id),
      connection.model(Post.name).findById(post.id),
      connection.model(ReportTargetState.name).findOne({
        targetId: post.id,
        round: 1,
      }),
      connection.model(ReportTargetState.name).findOne({
        targetId: post.id,
        round: 2,
      }),
      connection.model(GovernanceCorrection.name).findOne({ caseId: governanceCase.id }),
    ]);
    expect(storedCase).toMatchObject({
      status: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
      resolutionSource: 'ADMIN',
      resolutionReason: '管理员确认该内容违反当前规则。',
    });
    expect(restoredPost?.deletedAt).toBeNull();
    expect(oldState?.status).toBe(REPORT_TARGET_STATUSES.RESOLVED_VIOLATION);
    expect(nextState).toMatchObject({
      status: REPORT_TARGET_STATUSES.COLLECTING,
      round: 2,
      caseId: null,
      qualifiedReporters: [],
    });
    expect(correction).toMatchObject({
      previousRound: 1,
      nextRound: 2,
      action: 'RESTORE_CONTENT',
      publicReason: '复核后确认原裁决依据不足，恢复内容。',
    });
  });

  it('extends unresolved cases at 8h and moves to emergency at 48h', async () => {
    const { governanceCase } = await createViolationCase();
    const judge = await createAgent('judge', 5000);
    const dispatched = await service.dispatchNextCase(judge.id);
    await service.submitDecision(judge.id, dispatched.case.id, GOVERNANCE_DECISIONS.VIOLATION);

    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      firstReviewAt: new Date(Date.now() - 1000),
      normalDeadlineAt: new Date(Date.now() + 60_000),
    });
    await service.advanceDeadlines();
    let updated = await connection.model(GovernanceCase.name).findById(governanceCase.id);
    expect(updated?.status).toBe(GOVERNANCE_CASE_STATUS.OPEN);

    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      firstReviewAt: new Date(Date.now() - 1000),
      normalDeadlineAt: new Date(Date.now() - 1000),
    });
    await service.advanceDeadlines();
    updated = await connection.model(GovernanceCase.name).findById(governanceCase.id);
    expect(updated?.status).toBe(GOVERNANCE_CASE_STATUS.EMERGENCY);
  });

  it('finalizes as not violation at 56h unless votes exceed threshold and violation is majority', async () => {
    const { governanceCase } = await createViolationCase();
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      status: GOVERNANCE_CASE_STATUS.EMERGENCY,
      violationTally: 5,
      notViolationTally: 0,
      firstReviewAt: new Date(Date.now() - 56 * 60 * 60 * 1000),
      normalDeadlineAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      emergencyDeadlineAt: new Date(Date.now() - 1000),
    });

    await service.advanceDeadlines();
    const [finalized, reportState] = await Promise.all([
      connection.model(GovernanceCase.name).findById(governanceCase.id),
      connection.model(ReportTargetState.name).findOne({ caseId: governanceCase.id }),
    ]);
    expect(finalized?.status).toBe(GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION);
    expect(reportState?.status).toBe(REPORT_TARGET_STATUSES.RESOLVED_NOT_VIOLATION);
  });

  it('dispatches emergency cases before normal cases and excludes target author', async () => {
    const { author, governanceCase } = await createViolationCase();
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      status: GOVERNANCE_CASE_STATUS.EMERGENCY,
      normalDeadlineAt: new Date(Date.now() - 1000),
      emergencyDeadlineAt: new Date(Date.now() + 60_000),
    });
    const normal = await createViolationCase();
    const judge = await createAgent('judge', 5000);

    const authorProgress = await connection
      .model(AgentProgress.name)
      .findOne({ agentId: author.id });
    expect(authorProgress).toBeTruthy();
    authorProgress!.xpTotal = 5000;
    await authorProgress!.save();

    const authorDispatched = await service.dispatchNextCase(author.id);
    expect(authorDispatched.case.id).not.toBe(governanceCase.id);
    expect(authorDispatched.case.id).toBe(normal.governanceCase.id);

    const dispatched = await service.dispatchNextCase(judge.id);
    expect(dispatched.case.id).toBe(governanceCase.id);
    expect(dispatched.case.id).not.toBe(normal.governanceCase.id);
  });

  it('returns a backend-randomized result batch without pagination metadata', async () => {
    const oldResolvedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await connection.model(GovernanceCase.name).updateMany(
      {},
      {
        $set: {
          status: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
          resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
          resolvedAt: oldResolvedAt,
        },
      },
    );
    const openCase = await createViolationCase();
    for (let index = 0; index < 11; index += 1) {
      const { governanceCase } = await createViolationCase();
      await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
        status:
          index % 2 === 0
            ? GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
            : GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
        resolution:
          index % 2 === 0
            ? GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION
            : GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
        resolvedAt: new Date(Date.now() - index * 1000),
        violationTally: index + 1,
        notViolationTally: index,
      });
    }
    const batch = await service.getRandomResultBatch({ limit: 10 });
    expect(batch.items).toHaveLength(10);
    expect(batch).not.toHaveProperty('meta');
    expect(batch.sampledAt).toBeTruthy();
    expect(batch.items.some((item) => item.id === openCase.governanceCase.id)).toBe(false);
    expect(batch.items[0].targetSummary.kind).toMatch(/POST|REPLY/);
    expect(batch.items[0].tally.violation).toBeGreaterThanOrEqual(0);
    expect(batch.items[0]).not.toHaveProperty('activeKey');
    expect(batch.items[0]).not.toHaveProperty('assignment');
    expect(batch.items[0]).not.toHaveProperty('violationWeight');
    expect(batch.items[0]).not.toHaveProperty('triggerScore');
  });

  it('returns real governance plaza stats without mock data', async () => {
    const now = new Date();
    await connection.model(GovernanceCase.name).updateMany(
      {},
      {
        $set: {
          status: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
          resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
          resolvedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        },
      },
    );
    const openCase = await createViolationCase();
    const emergency = await createViolationCase();
    await connection.model(GovernanceCase.name).findByIdAndUpdate(emergency.governanceCase.id, {
      status: GOVERNANCE_CASE_STATUS.EMERGENCY,
    });
    const violation = await createViolationCase();
    await connection.model(GovernanceCase.name).findByIdAndUpdate(violation.governanceCase.id, {
      status: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
      resolution: GOVERNANCE_CASE_STATUS.RESOLVED_VIOLATION,
      resolvedAt: now,
      violationTally: 8,
      notViolationTally: 2,
    });
    const notViolation = await createViolationCase();
    await connection.model(GovernanceCase.name).findByIdAndUpdate(notViolation.governanceCase.id, {
      status: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
      resolution: GOVERNANCE_CASE_STATUS.RESOLVED_NOT_VIOLATION,
      resolvedAt: now,
      violationTally: 1,
      notViolationTally: 6,
    });
    const stats = await service.getStats();
    expect(stats.openCount).toBe(1);
    expect(stats.emergencyCount).toBe(1);
    expect(stats.recentResolvedCount).toBe(2);
    expect(stats.violationResolvedCount).toBe(1);
    expect(stats.notViolationResolvedCount).toBe(1);
    expect(stats.violationResolvedCount).toBeGreaterThanOrEqual(1);
    expect(stats.notViolationResolvedCount).toBeGreaterThanOrEqual(1);
    expect(openCase.governanceCase.id).toBeTruthy();
    expect(stats.averageResolutionMinutes).not.toBeNull();
  });

  it('keeps results and stats read-only without advancing overdue deadlines', async () => {
    const { governanceCase } = await createViolationCase();
    await connection.model(GovernanceCase.name).findByIdAndUpdate(governanceCase.id, {
      firstReviewAt: new Date(Date.now() - 1000),
      normalDeadlineAt: new Date(Date.now() - 1000),
      emergencyDeadlineAt: new Date(Date.now() - 1000),
    });

    await service.getRandomResultBatch({ limit: 10 });
    await service.getStats();

    const unchanged = await connection.model(GovernanceCase.name).findById(governanceCase.id);
    expect(unchanged?.status).toBe(GOVERNANCE_CASE_STATUS.OPEN);
    expect(unchanged?.resolvedAt).toBeNull();
  });
});
