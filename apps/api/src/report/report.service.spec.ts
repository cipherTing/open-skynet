import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { CircleService } from '@/circle/circle.service';
import { DatabaseService } from '@/database/database.service';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import {
  AgentGovernanceProfile,
  AgentGovernanceProfileSchema,
} from '@/database/schemas/agent-governance-profile.schema';
import {
  AgentProgress,
  AgentProgressSchema,
} from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent, AgentXpEventSchema } from '@/database/schemas/agent-xp-event.schema';
import {
  CircleRuleRevision,
  CircleRuleRevisionSchema,
} from '@/database/schemas/circle-rule-revision.schema';
import { FeatureFlag, FeatureFlagSchema } from '@/database/schemas/feature-flag.schema';
import { Feedback, FeedbackSchema } from '@/database/schemas/feedback.schema';
import {
  GovernanceAssignment,
  GovernanceAssignmentSchema,
} from '@/database/schemas/governance-assignment.schema';
import { GovernanceCase, GovernanceCaseSchema } from '@/database/schemas/governance-case.schema';
import {
  GovernanceDailyQuota,
  GovernanceDailyQuotaSchema,
} from '@/database/schemas/governance-daily-quota.schema';
import { GovernanceVote, GovernanceVoteSchema } from '@/database/schemas/governance-vote.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { Report, ReportSchema } from '@/database/schemas/report.schema';
import {
  ReportTargetState,
  ReportTargetStateSchema,
} from '@/database/schemas/report-target-state.schema';
import {
  GOVERNANCE_HEALTH_LEVEL,
} from '@/governance/governance.constants';
import { GovernanceService } from '@/governance/governance.service';
import { ProgressionService } from '@/progression/progression.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import {
  REPORT_REASONS,
  REPORT_TARGET_STATUSES,
  REPORT_TARGET_TYPES,
} from './report.constants';
import { ReportService } from './report.service';

const TEST_CIRCLE_ID = '64f100000000000000000001';
let sequence = 0;

describe('ReportService integration', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: ReportService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentXpEvent.name, schema: AgentXpEventSchema },
          { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
          { name: FeatureFlag.name, schema: FeatureFlagSchema },
          { name: Feedback.name, schema: FeedbackSchema },
          { name: GovernanceAssignment.name, schema: GovernanceAssignmentSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: GovernanceDailyQuota.name, schema: GovernanceDailyQuotaSchema },
          { name: GovernanceVote.name, schema: GovernanceVoteSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: Report.name, schema: ReportSchema },
          { name: ReportTargetState.name, schema: ReportTargetStateSchema },
        ]),
      ],
      providers: [
        ReportService,
        GovernanceService,
        ProgressionService,
        DatabaseService,
        FeatureFlagService,
        {
          provide: CircleService,
          useValue: { unpinRemovedPost: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(ReportService);
    await Promise.all([
      connection.model(Report.name).init(),
      connection.model(ReportTargetState.name).init(),
      connection.model(GovernanceCase.name).init(),
      connection.model(Agent.name).init(),
    ]);
    await connection.model(CircleRuleRevision.name).create({
      circleId: TEST_CIRCLE_ID,
      version: 1,
      rules: ['只能用于友好交流，不得以破坏社区为目的'],
      source: 'SYSTEM',
      actorAgentId: null,
    });
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  async function createAgent(ownerUserId?: string, deletedAt: Date | null = null) {
    sequence += 1;
    const unique = `report-agent-${sequence}`;
    const agent = await connection.model(Agent.name).create({
      name: unique,
      description: `${unique} description`,
      userId: ownerUserId ?? `${unique}-owner`,
      deletedAt,
    });
    await Promise.all([
      connection.model(AgentProgress.name).create({
        agentId: agent.id,
        xpTotal: 5_000,
        staminaCurrent: 100,
        staminaLastSettledAt: new Date(),
        dailyProgressDate: '2026-07-12',
        dailyCounters: {},
        awardedDailyTaskIds: [],
      }),
      connection.model(AgentGovernanceProfile.name).create({
        agentId: agent.id,
        healthLevel: GOVERNANCE_HEALTH_LEVEL.GOOD,
        violationCount: 0,
      }),
    ]);
    return agent;
  }

  async function createPost(authorId: string) {
    sequence += 1;
    return connection.model(Post.name).create({
      title: `report target ${sequence}`,
      content: '用于验证独立举报治理链路的内容',
      authorId,
      circleId: TEST_CIRCLE_ID,
      circleRulesVersion: 1,
      deletedAt: null,
    });
  }

  function reportPost(agentId: string, ownerUserId: string, postId: string) {
    return service.createReport(agentId, ownerUserId, {
      targetType: REPORT_TARGET_TYPES.POST,
      targetId: postId,
      reason: REPORT_REASONS.COMMUNITY_SABOTAGE,
      evidence: '内容明确试图破坏社区的正常交流',
    });
  }

  it('opens exactly one case after three distinct agents and owners report concurrently', async () => {
    const author = await createAgent();
    const post = await createPost(author.id);
    const reporters = await Promise.all([createAgent(), createAgent(), createAgent()]);

    const results = await Promise.all(
      reporters.map((agent) => reportPost(agent.id, agent.userId, post.id)),
    );

    expect(await connection.model(Report.name).countDocuments({ targetId: post.id })).toBe(3);
    const state = await connection.model(ReportTargetState.name).findOne({ targetId: post.id });
    expect(state).toMatchObject({
      status: REPORT_TARGET_STATUSES.CASE_OPEN,
    });
    expect(state?.qualifiedReporters).toHaveLength(3);
    const governanceCases = await connection.model(GovernanceCase.name)
      .find({ targetId: post.id })
      .select('+reporterAgentIds');
    expect(governanceCases).toHaveLength(1);
    expect(new Set(governanceCases[0]?.reporterAgentIds)).toEqual(
      new Set(reporters.map((agent) => agent.id)),
    );
    expect(results.filter((result) => result.status === REPORT_TARGET_STATUSES.CASE_OPEN)).not.toHaveLength(0);

    const firstReport = await connection.model(Report.name).findOne({
      reporterAgentId: reporters[0]?.id,
      targetId: post.id,
    });
    const repeated = await service.createReport(reporters[0]!.id, reporters[0]!.userId, {
      targetType: REPORT_TARGET_TYPES.POST,
      targetId: post.id,
      reason: REPORT_REASONS.SPAM_OR_FLOODING,
      evidence: '这次重试不应覆盖首次证据',
    });
    expect(repeated).toMatchObject({
      created: false,
      reportId: firstReport?.id,
      status: REPORT_TARGET_STATUSES.CASE_OPEN,
      caseId: governanceCases[0]?.id,
    });
    expect((await connection.model(Report.name).findById(firstReport?.id))?.reason)
      .toBe(REPORT_REASONS.COMMUNITY_SABOTAGE);

    const fourth = await createAgent();
    const afterCaseOpen = await reportPost(fourth.id, fourth.userId, post.id);
    expect(afterCaseOpen).toMatchObject({
      created: false,
      reportId: null,
      status: REPORT_TARGET_STATUSES.CASE_OPEN,
    });
    expect(await connection.model(Report.name).countDocuments({ targetId: post.id })).toBe(3);
  });

  it('makes concurrent retries by the same agent idempotent', async () => {
    const author = await createAgent();
    const reporter = await createAgent();
    const post = await createPost(author.id);

    const results = await Promise.all([
      reportPost(reporter.id, reporter.userId, post.id),
      reportPost(reporter.id, reporter.userId, post.id),
    ]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.filter((result) => !result.created)).toHaveLength(1);
    expect(await connection.model(Report.name).countDocuments({ targetId: post.id })).toBe(1);
    expect((await connection.model(ReportTargetState.name).findOne({ targetId: post.id }))?.qualifiedReporters)
      .toHaveLength(1);
  });

  it('counts at most one reporter agent for the same owner and target', async () => {
    const author = await createAgent();
    const ownerUserId = `rotated-reporter-owner-${++sequence}`;
    const oldReporter = await createAgent(ownerUserId, new Date());
    const currentReporter = await createAgent(ownerUserId);
    const post = await createPost(author.id);

    const first = await reportPost(oldReporter.id, ownerUserId, post.id);
    const rotated = await reportPost(currentReporter.id, ownerUserId, post.id);

    expect(first.created).toBe(true);
    expect(rotated).toMatchObject({
      created: false,
      reportId: null,
      status: REPORT_TARGET_STATUSES.COLLECTING,
    });
    expect(await connection.model(Report.name).countDocuments({ targetId: post.id })).toBe(1);
  });

  it('keeps existing-report retries available while new reports are disabled', async () => {
    const author = await createAgent();
    const reporter = await createAgent();
    const otherReporter = await createAgent();
    const post = await createPost(author.id);
    const created = await reportPost(reporter.id, reporter.userId, post.id);
    await connection.model(FeatureFlag.name).findOneAndUpdate(
      { key: 'reports' },
      {
        key: 'reports',
        enabled: false,
        reason: '紧急暂停新举报',
        updatedByUserId: 'admin-test',
      },
      { upsert: true },
    );

    const repeated = await reportPost(reporter.id, reporter.userId, post.id);
    expect(repeated).toMatchObject({ created: false, reportId: created.reportId });
    await expect(reportPost(otherReporter.id, otherReporter.userId, post.id))
      .rejects.toBeInstanceOf(ServiceUnavailableException);

    await connection.model(FeatureFlag.name).updateOne(
      { key: 'reports' },
      { $set: { enabled: true } },
    );
  });

  it('rejects reporting content created by an older agent of the same owner', async () => {
    const ownerUserId = `shared-owner-${++sequence}`;
    const oldAuthor = await createAgent(ownerUserId, new Date());
    const currentAgent = await createAgent(ownerUserId);
    const post = await createPost(oldAuthor.id);

    await expect(reportPost(currentAgent.id, ownerUserId, post.id))
      .rejects.toBeInstanceOf(ConflictException);
    expect(await connection.model(Report.name).countDocuments({ targetId: post.id })).toBe(0);
  });

  it('does not award progression and keeps reports append-only', async () => {
    const author = await createAgent();
    const reporter = await createAgent();
    const post = await createPost(author.id);
    const before = await connection.model(AgentProgress.name).findOne({ agentId: reporter.id });
    const created = await reportPost(reporter.id, reporter.userId, post.id);
    const after = await connection.model(AgentProgress.name).findOne({ agentId: reporter.id });
    expect(after?.xpTotal).toBe(before?.xpTotal);
    expect(after?.dailyCounters).toEqual(before?.dailyCounters);

    await expect(
      connection.model(Report.name).updateOne(
        { _id: created.reportId },
        { $set: { evidence: '尝试篡改' } },
      ),
    ).rejects.toThrow('只允许创建');
  });

  it('rejects startup when legacy VIOLATION feedback still exists', async () => {
    const legacyId = new Types.ObjectId();
    await connection.model(Feedback.name).collection.insertOne({
      _id: legacyId,
      type: 'VIOLATION',
      targetType: 'POST',
      agentId: 'legacy-agent',
      postId: new Types.ObjectId().toString(),
      replyId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(service.onModuleInit()).rejects.toThrow('pnpm db:reset');
    await connection.model(Feedback.name).collection.deleteOne({ _id: legacyId });
  });
});
