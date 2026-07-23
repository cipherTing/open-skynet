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
import { RedisService } from '@/redis/redis.service';
import { CircleService } from './circle.service';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';
import {
  CirclePostVisibilityState,
  CirclePostVisibilityStateSchema,
} from '@/database/schemas/circle-post-visibility-state.schema';
import { PostVisibilityService } from '@/post-visibility/post-visibility.service';

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
  const redisClient = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const getCirclesHotPosts = jest.fn();

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
          { name: CirclePostVisibilityState.name, schema: CirclePostVisibilityStateSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        CircleService,
        PostVisibilityService,
        { provide: FeatureFlagService, useValue: featureFlagService },
        { provide: RedisService, useValue: { getClient: () => redisClient } },
        { provide: HotRankingService, useValue: { getCirclesHotPosts } },
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
    getCirclesHotPosts.mockReset();
    getCirclesHotPosts.mockResolvedValue(new Map());
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
      'circle_post_visibility_states',
    ];
    await Promise.all(collections.map((name) => connection.db?.collection(name).deleteMany({})));
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
    if (replicaSet) await replicaSet.stop();
  });

  async function createOfficialCircle() {
    return databaseService.$transaction((session) =>
      service.createCircleForAdmin(
        { name: '官方公告区', topic: '由管理员建立的官方圈子', kind: 'OFFICIAL' },
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

    await databaseService.$transaction((session) =>
      service.updateCircleForAdmin(
        created.id,
        {
          topic: { value: '发布平台运行说明、公共变更和社区秩序信息。', expectedVersion: 1 },
          rules: { value: nextRules, expectedVersion: 1 },
          reason: '补充官方圈子的用途和首条公开规则。',
        },
        session,
      ),
    );

    const logs = await service.listMaintenanceLogs(created.id, { page: 1, pageSize: 10 });
    const topicLog = logs.items.find((item) => item.action === 'CIRCLE_UPDATED');
    const rulesLog = logs.items.find((item) => item.action === 'RULES_UPDATED');
    if (!topicLog || !rulesLog) throw new Error('圈子简介或规则修改记录不存在');

    await expect(service.getMaintenanceLogDetail(created.id, topicLog.id)).resolves.toMatchObject({
      change: {
        kind: 'TOPIC',
        previousTopic: '由管理员建立的官方圈子',
        nextTopic: '发布平台运行说明、公共变更和社区秩序信息。',
      },
    });
    await expect(service.getMaintenanceLogDetail(created.id, rulesLog.id)).resolves.toMatchObject({
      change: { kind: 'RULES', previousRules: [], nextRules },
    });
  });

  it('allows an administrator to create a normal circle', async () => {
    const created = await databaseService.$transaction((session) =>
      service.createCircleForAdmin(
        { name: '普通讨论区', topic: '管理员建立但不授予官方身份', kind: 'NORMAL' },
        session,
      ),
    );
    expect(created.kind).toBe('NORMAL');
  });

  it('omits empty hot-post fields and returns populated hot-post fields on request', async () => {
    const created = await createOfficialCircle();
    getCirclesHotPosts.mockResolvedValueOnce(new Map([[created.id, []]]));

    const emptyResult = await service.listCircles({ includeHotPosts: true });
    expect(emptyResult.circles).toHaveLength(1);
    expect(Object.hasOwn(emptyResult.circles[0] ?? {}, 'hotPosts')).toBe(false);

    const hotPost = {
      id: new Types.ObjectId().toString(),
      title: '社区正在讨论的热门主题',
      createdAt: new Date().toISOString(),
    };
    getCirclesHotPosts.mockResolvedValueOnce(new Map([[created.id, [hotPost]]]));

    await expect(service.listCircles({ includeHotPosts: true })).resolves.toMatchObject({
      circles: [expect.objectContaining({ hotPosts: [hotPost] })],
    });
  });

  it('rejects no-op administrator updates without advancing versions', async () => {
    const created = await createOfficialCircle();
    await expect(
      databaseService.$transaction((session) =>
        service.updateCircleForAdmin(
          created.id,
          {
            topic: { value: created.topic, expectedVersion: created.topicVersion },
            rules: { value: [], expectedVersion: created.rulesVersion },
            reason: '尝试提交没有变化的内容。',
          },
          session,
        ),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CIRCLE_UNCHANGED' }),
    });
    const unchanged = await connection.model(Circle.name).findById(created.id);
    expect(unchanged).toMatchObject({ topicVersion: 1, rulesVersion: 1 });
  });

  it('rejects a stale administrator scope version', async () => {
    const created = await createOfficialCircle();
    await expect(
      databaseService.$transaction((session) =>
        service.updateCircleForAdmin(
          created.id,
          {
            topic: { value: '新的圈子简介', expectedVersion: 99 },
            reason: '验证旧版本不能覆盖新内容。',
          },
          session,
        ),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CIRCLE_TOPIC_VERSION_CONFLICT' }),
    });
  });

  it('advances only the administrator scope that actually changed', async () => {
    const created = await createOfficialCircle();
    const reason = '只修正圈子简介，不改动现有规则。';

    await databaseService.$transaction((session) =>
      service.updateCircleForAdmin(
        created.id,
        {
          topic: { value: '仅更新后的官方圈子简介', expectedVersion: 1 },
          reason,
        },
        session,
      ),
    );

    const updated = await connection.model(Circle.name).findById(created.id);
    const changeLogs = await connection.model(CircleMaintenanceLog.name).find({
      circleId: created.id,
      publicReason: reason,
    });
    expect(updated).toMatchObject({
      topic: '仅更新后的官方圈子简介',
      topicVersion: 2,
      rulesVersion: 1,
      rules: [],
    });
    expect(changeLogs).toHaveLength(1);
    expect(changeLogs[0]?.action).toBe('CIRCLE_UPDATED');
  });

  it('records the actual previous and next status when an administrator bans a circle', async () => {
    const created = await createOfficialCircle();

    await databaseService.$transaction((session) =>
      service.setCircleStatusForAdmin(created.id, 'BANNED', '违反圈子使用规范。', session),
    );

    const logs = await service.listMaintenanceLogs(created.id, { page: 1, pageSize: 10 });
    const statusLog = logs.items.find((item) => item.action === 'CIRCLE_BANNED');
    if (!statusLog) throw new Error('圈子封禁记录不存在');
    await expect(service.getMaintenanceLogDetail(created.id, statusLog.id)).resolves.toMatchObject({
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
    expect(result.progressDelta).toBeNull();
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
