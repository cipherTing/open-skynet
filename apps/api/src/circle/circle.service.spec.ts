import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
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
import { CircleProposal, CircleProposalSchema } from '@/database/schemas/circle-proposal.schema';
import {
  CircleRuleRevision,
  CircleRuleRevisionSchema,
} from '@/database/schemas/circle-rule-revision.schema';
import {
  CircleSubscription,
  CircleSubscriptionSchema,
} from '@/database/schemas/circle-subscription.schema';
import {
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from '@/database/schemas/content-review-request.schema';
import { GovernanceCase, GovernanceCaseSchema } from '@/database/schemas/governance-case.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { DatabaseService } from '@/database/database.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { CircleService } from './circle.service';

describe('CircleService creation and subscriptions', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let databaseService: DatabaseService;
  let service: CircleService;
  const featureFlagService = {
    assertEnabled: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(false),
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
          { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
          { name: CircleSubscription.name, schema: CircleSubscriptionSchema },
          { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: Post.name, schema: PostSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        CircleService,
        { provide: FeatureFlagService, useValue: featureFlagService },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    databaseService = moduleRef.get(DatabaseService);
    service = moduleRef.get(CircleService);
    await Promise.all([
      connection.model(Circle.name).init(),
      connection.model(CircleSubscription.name).init(),
      connection.model(ContentReviewRequest.name).init(),
    ]);
  });

  beforeEach(async () => {
    featureFlagService.assertEnabled.mockResolvedValue(undefined);
    featureFlagService.isEnabled.mockResolvedValue(false);
    const collections = [
      'agents',
      'agent_governance_profiles',
      'agent_progresses',
      'circles',
      'circle_maintenance_logs',
      'circle_proposals',
      'circle_rule_revisions',
      'circle_subscriptions',
      'content_review_requests',
      'governance_cases',
      'posts',
    ];
    await Promise.all(collections.map((name) => connection.db?.collection(name).deleteMany({})));
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
    if (replicaSet) await replicaSet.stop();
  });

  async function createOfficialCircle() {
    return databaseService.$requiredTransaction((session) =>
      service.createCircleForAdmin(
        { name: '官方公告区', topic: '由管理员建立的官方圈子' },
        session,
      ),
    );
  }

  it('creates an official circle only through the administrator path', async () => {
    const created = await createOfficialCircle();
    expect(created).toMatchObject({
      kind: 'OFFICIAL',
      status: 'ACTIVE',
      createdByType: 'ADMIN',
      createdByAgentId: null,
      rules: [],
    });
    const revision = await connection.model(CircleRuleRevision.name).findOne({
      circleId: created.id,
      version: 1,
    });
    expect(revision).toMatchObject({ rules: [], source: 'ADMIN' });
  });

  it('returns topic and rule snapshots for an administrator co-build record', async () => {
    const created = await createOfficialCircle();
    const nextRules = [{ id: crypto.randomUUID(), text: '发布内容必须与平台运行或社区秩序相关。' }];

    await databaseService.$requiredTransaction((session) =>
      service.updateCircleForAdmin(
        created.id,
        {
          topic: '发布平台运行说明、公共变更和社区秩序信息。',
          rules: nextRules,
          publicReason: '补充官方圈子的用途和首条公开规则。',
        },
        session,
      ),
    );

    const logs = await service.listMaintenanceLogs(created.id, { page: 1, pageSize: 10 });
    const topicLog = logs.items.find((item) => item.action === 'CIRCLE_UPDATED');
    const rulesLog = logs.items.find((item) => item.action === 'RULES_UPDATED');
    expect(topicLog).toBeDefined();
    expect(rulesLog).toBeDefined();

    await expect(service.getMaintenanceLogDetail(created.id, topicLog!.id)).resolves.toMatchObject({
      change: {
        kind: 'TOPIC',
        previousTopic: '由管理员建立的官方圈子',
        nextTopic: '发布平台运行说明、公共变更和社区秩序信息。',
      },
    });
    await expect(service.getMaintenanceLogDetail(created.id, rulesLog!.id)).resolves.toMatchObject({
      change: { kind: 'RULES', previousRules: [], nextRules },
    });
  });

  it('records the actual previous and next status when an administrator bans a circle', async () => {
    const created = await createOfficialCircle();

    await databaseService.$requiredTransaction((session) =>
      service.setCircleStatusForAdmin(created.id, 'BANNED', '违反圈子使用规范。', session),
    );

    const logs = await service.listMaintenanceLogs(created.id, { page: 1, pageSize: 10 });
    const statusLog = logs.items.find((item) => item.action === 'CIRCLE_BANNED');
    expect(statusLog).toBeDefined();
    await expect(service.getMaintenanceLogDetail(created.id, statusLog!.id)).resolves.toMatchObject({
      change: { kind: 'STATUS', previousStatus: 'ACTIVE', nextStatus: 'BANNED' },
    });
  });

  it('creates a review request without creating a circle when review is enabled', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'circle-review-agent',
      description: 'circle review agent',
      userId: 'circle-review-owner',
    });
    await Promise.all([
      connection.model(AgentProgress.name).create({
        agentId: agent.id,
        xpTotal: 5_000,
        staminaCurrent: 100,
        staminaLastSettledAt: new Date(),
        dailyProgressDate: '2026-07-13',
        dailyCounters: {},
        awardedDailyTaskIds: [],
      }),
      connection.model(AgentGovernanceProfile.name).create({
        agentId: agent.id,
        healthLevel: 4,
        violationCount: 0,
      }),
    ]);
    featureFlagService.isEnabled.mockResolvedValue(true);

    const result = await service.createCircle(agent.id, {
      name: '等待审核的圈子',
      topic: '审核通过之前不会公开显示',
    });

    expect(result.outcome).toBe('PENDING_REVIEW');
    expect(await connection.model(Circle.name).countDocuments()).toBe(0);
    expect(await connection.model(ContentReviewRequest.name).findOne()).toMatchObject({
      type: 'CIRCLE',
      status: 'PENDING',
      requesterAgentId: agent.id,
      pendingNameKey: '等待审核的圈子',
    });
  });

  it('keeps repeat subscriptions idempotent and increments the count once', async () => {
    const circle = await createOfficialCircle();
    const agent = await connection.model(Agent.name).create({
      name: 'subscriber-agent',
      description: 'subscriber agent',
      userId: 'subscriber-owner',
    });

    await service.subscribe(agent.id, circle.id);
    await service.subscribe(agent.id, circle.id);

    expect(
      await connection.model(CircleSubscription.name).countDocuments({
        agentId: agent.id,
        circleId: circle.id,
      }),
    ).toBe(1);
    expect((await connection.model(Circle.name).findById(circle.id))?.subscriberCount).toBe(1);
  });
});
