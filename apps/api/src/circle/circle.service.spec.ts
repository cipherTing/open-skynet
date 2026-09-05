import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
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
  CircleMembership,
  CircleMembershipSchema,
} from '@/database/schemas/circle-membership.schema';
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
import {
  BusinessCalendarConfig,
  BusinessCalendarConfigSchema,
} from '@/database/schemas/business-calendar-config.schema';
import { BusinessCalendarService } from '@/system/business-calendar.service';

describe('CircleService creation and memberships', () => {
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
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: CircleMaintenanceLog.name, schema: CircleMaintenanceLogSchema },
          { name: CircleProposal.name, schema: CircleProposalSchema },
          { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
          { name: CircleMembership.name, schema: CircleMembershipSchema },
          { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: Post.name, schema: PostSchema },
          { name: CirclePostVisibilityState.name, schema: CirclePostVisibilityStateSchema },
          { name: BusinessCalendarConfig.name, schema: BusinessCalendarConfigSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        CircleService,
        PostVisibilityService,
        BusinessCalendarService,
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
      connection.model(CircleMembership.name).init(),
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
      'agent_progresses',
      'circles',
      'circle_maintenance_logs',
      'circle_proposals',
      'circle_rule_revisions',
      'circle_memberships',
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

  async function createAgentWithXp(label: string, xpTotal: number) {
    const agent = await connection.model(Agent.name).create({
      name: label,
      description: `${label} description`,
      userId: `${label}-owner`,
    });
    await connection.model(AgentProgress.name).create({
      agentId: agent.id,
      xpTotal,
      staminaCurrent: 100,
      staminaLastSettledAt: new Date(),
      progressDay: '2026-07-13',
      dailyCounters: {},
      awardedDailyTaskIds: [],
    });
    return agent;
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

  it('publishes the default Agent posting policy for a new official circle', async () => {
    const created = await createOfficialCircle();

    const serialized = service.serializeCircleForAdmin(created) as {
      agentPostingEnabled?: boolean;
      postingPolicyVersion?: number;
    };

    expect(serialized).toMatchObject({
      kind: 'OFFICIAL',
      agentPostingEnabled: true,
      postingPolicyVersion: 1,
    });
  });

  it('changes an official circle Agent posting policy with optimistic concurrency', async () => {
    const created = await createOfficialCircle();
    const update = {
      agentPostingEnabled: { value: false, expectedVersion: 1 },
      reason: '官方公告发布期间暂不接收外部投稿。',
    };

    const updated = await databaseService.$transaction((session) =>
      service.updateCircleForAdmin(
        created.id,
        update as Parameters<typeof service.updateCircleForAdmin>[1],
        session,
      ),
    );

    expect(service.serializeCircleForAdmin(updated)).toMatchObject({
      agentPostingEnabled: false,
      postingPolicyVersion: 2,
    });
    await expect(
      databaseService.$transaction((session) =>
        service.updateCircleForAdmin(
          created.id,
          update as Parameters<typeof service.updateCircleForAdmin>[1],
          session,
        ),
      ),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_UNCHANGED' } });
    await expect(
      databaseService.$transaction((session) =>
        service.updateCircleForAdmin(
          created.id,
          {
            agentPostingEnabled: { value: true, expectedVersion: 1 },
            reason: '使用过期版本重新开放外部投稿。',
          } as Parameters<typeof service.updateCircleForAdmin>[1],
          session,
        ),
      ),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_POSTING_POLICY_VERSION_CONFLICT' } });
  });

  it('rejects an Agent posting policy change for a normal circle', async () => {
    const circle = await databaseService.$transaction((session) =>
      service.createCircleForAdmin(
        { name: '普通讨论区', topic: '普通圈子始终允许 Agent 发帖', kind: 'NORMAL' },
        session,
      ),
    );

    await expect(
      databaseService.$transaction((session) =>
        service.updateCircleForAdmin(
          circle.id,
          {
            agentPostingEnabled: { value: false, expectedVersion: 1 },
            reason: '不应允许把普通圈子切换为禁发。',
          },
          session,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: 'CIRCLE_AGENT_POSTING_POLICY_OFFICIAL_ONLY' },
    });
    expect(service.serializeCircleForAdmin(circle)).toMatchObject({
      agentPostingEnabled: true,
      postingPolicyVersion: 1,
    });
  });

  it('blocks Agent posting in an official circle after its posting policy is closed', async () => {
    const circle = await createOfficialCircle();
    await databaseService.$transaction((session) =>
      service.updateCircleForAdmin(
        circle.id,
        {
          agentPostingEnabled: { value: false, expectedVersion: 1 },
          reason: '官方发布窗口关闭外部投稿。',
        },
        session,
      ),
    );

    await expect(service.assertAgentPostAllowed(circle.id, false)).rejects.toMatchObject({
      response: { code: 'CIRCLE_AGENT_POSTING_DISABLED' },
    });
  });

  it('allows an explicit administrator browser bypass for a closed official circle', async () => {
    const circle = await createOfficialCircle();
    await databaseService.$transaction((session) =>
      service.updateCircleForAdmin(
        circle.id,
        {
          agentPostingEnabled: { value: false, expectedVersion: 1 },
          reason: '官方内容仅由管理员浏览器会话发布。',
        },
        session,
      ),
    );

    await expect(service.assertAgentPostAllowed(circle.id, true)).resolves.toMatchObject({
      id: circle.id,
    });
  });

  it('always allows Agent posting for normal and legacy circles', async () => {
    const normal = await databaseService.$transaction((session) =>
      service.createCircleForAdmin(
        { name: '普通允许圈子', topic: '普通圈子不受官方发帖策略影响', kind: 'NORMAL' },
        session,
      ),
    );
    const legacyOfficial = await createOfficialCircle();
    await connection
      .model(Circle.name)
      .updateOne({ _id: normal.id }, { $set: { agentPostingEnabled: false } });
    await connection
      .model(Circle.name)
      .updateOne(
        { _id: legacyOfficial.id },
        { $unset: { agentPostingEnabled: 1, postingPolicyVersion: 1 } },
      );

    await expect(service.assertAgentPostAllowed(normal.id, false)).resolves.toMatchObject({
      id: normal.id,
    });
    await expect(service.assertAgentPostAllowed(legacyOfficial.id, false)).resolves.toMatchObject({
      id: legacyOfficial.id,
    });
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

    const logs = await service.listMaintenanceLogs(created.id, { limit: 10 });
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
    expect(emptyResult.items).toHaveLength(1);
    expect(Object.hasOwn(emptyResult.items[0] ?? {}, 'hotPosts')).toBe(false);

    const hotPost = {
      id: new Types.ObjectId().toString(),
      title: '社区正在讨论的热门主题',
      createdAt: new Date().toISOString(),
    };
    getCirclesHotPosts.mockResolvedValueOnce(new Map([[created.id, [hotPost]]]));

    await expect(service.listCircles({ includeHotPosts: true })).resolves.toMatchObject({
      items: [expect.objectContaining({ hotPosts: [hotPost] })],
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

    const logs = await service.listMaintenanceLogs(created.id, { limit: 10 });
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
    await connection.model(AgentProgress.name).create({
      agentId: agent.id,
      xpTotal: 5_000,
      staminaCurrent: 100,
      staminaLastSettledAt: new Date(),
      progressDay: '2026-07-13',
      dailyCounters: {},
      awardedDailyTaskIds: [],
    });
    featureFlagService.isEnabled.mockResolvedValue(true);

    const result = await service.createCircle(agent.id, {
      name: '等待审核的圈子',
      topic: '审核通过之前不会公开显示',
    });

    expect(result.outcome).toBe('PENDING_REVIEW');
    expect(result.progressDelta).toBeNull();
    expect(await connection.model(Circle.name).countDocuments()).toBe(0);
    expect(await connection.model(ContentReviewRequest.name).findOne().lean()).toMatchObject({
      type: 'CIRCLE',
      status: 'PENDING',
      requesterAgentId: agent.id,
      payload: { normalizedName: '等待审核的圈子' },
    });
  });

  it('allows an Agent at level 2 to create a circle', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'level-two-circle-agent',
      description: 'level two circle agent',
      userId: 'level-two-circle-owner',
    });
    await connection.model(AgentProgress.name).create({
      agentId: agent.id,
      xpTotal: 400,
      staminaCurrent: 100,
      staminaLastSettledAt: new Date(),
      progressDay: '2026-07-13',
      dailyCounters: {},
      awardedDailyTaskIds: [],
    });

    const result = await service.createCircle(agent.id, {
      name: 'Lv2 可创建圈子',
      topic: '等级二的创建资格',
    });

    expect(result.outcome).toBe('PUBLISHED');
    if (result.outcome !== 'PUBLISHED') {
      throw new Error('等级二的 Agent 应直接创建圈子');
    }
  });

  it('uses the Agent creation timestamp as the sole creation-window record', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'rolling-window-circle-agent',
      description: 'rolling window circle agent',
      userId: 'rolling-window-circle-owner',
    });
    await connection.model(AgentProgress.name).create({
      agentId: agent.id,
      xpTotal: 400,
      staminaCurrent: 100,
      staminaLastSettledAt: new Date(),
      progressDay: '2026-07-13',
      dailyCounters: {},
      awardedDailyTaskIds: [],
    });
    await connection.model(Circle.name).create({
      slug: 'recent-circle',
      name: '近期创建的圈子',
      normalizedName: '近期创建的圈子',
      topic: '七天内的创建记录必须阻止再次创建',
      createdByType: 'AGENT',
      createdByAgentId: agent.id,
      kind: 'NORMAL',
      status: 'ACTIVE',
      rules: [],
    });

    await expect(
      service.createCircle(agent.id, { name: '可创建的新圈子', topic: '旧圈子不参与滚动窗口判断' }),
    ).resolves.toMatchObject({ outcome: 'PUBLISHED' });
  });

  it('rejects an Agent below level 2', async () => {
    const agent = await createAgentWithXp('level-one-circle-agent', 399);

    await expect(
      service.createCircle(agent.id, { name: '等级不足圈子', topic: '等级一不能创建圈子' }),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_NOT_ELIGIBLE' } });
  });

  it('rejects an Agent below level 2 when circle review is enabled', async () => {
    const agent = await createAgentWithXp('review-level-one-circle-agent', 399);
    featureFlagService.isEnabled.mockResolvedValue(true);

    await expect(
      service.createCircle(agent.id, { name: '审核等级不足圈子', topic: '等级一不能提交圈子审核' }),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_NOT_ELIGIBLE' } });
    expect(await connection.model(ContentReviewRequest.name).countDocuments()).toBe(0);
  });

  it('keeps a deleted circle within its creator rolling seven-day window', async () => {
    const agent = await createAgentWithXp('deleted-circle-window-agent', 400);
    await service.createCircle(agent.id, {
      name: '将被删除的圈子',
      topic: '创建记录不因删除而释放',
    });
    await connection
      .model(Circle.name)
      .updateOne({ createdByAgentId: agent.id }, { $set: { deletedAt: new Date() } });

    await expect(
      service.createCircle(agent.id, { name: '删除后仍受限', topic: '滚动窗口尚未到期' }),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_WEEKLY_LIMIT_REACHED' } });
  });

  it('allows an Agent to create again after the rolling seven-day window expires', async () => {
    const agent = await createAgentWithXp('expired-circle-window-agent', 400);
    await connection
      .model(Agent.name)
      .updateOne(
        { _id: agent.id },
        { $set: { lastCircleCreatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1) } },
      );

    await expect(
      service.createCircle(agent.id, { name: '窗口已过期', topic: '七天后可以再次创建' }),
    ).resolves.toMatchObject({ outcome: 'PUBLISHED' });
  });

  it('reserves the rolling window when a circle is pending review', async () => {
    const agent = await createAgentWithXp('pending-circle-window-agent', 400);
    featureFlagService.isEnabled.mockResolvedValue(true);
    await expect(
      service.createCircle(agent.id, {
        name: '待审核占用窗口',
        topic: '待审核申请同样占用创建窗口',
      }),
    ).resolves.toMatchObject({ outcome: 'PENDING_REVIEW' });
    featureFlagService.isEnabled.mockResolvedValue(false);

    await expect(
      service.createCircle(agent.id, { name: '待审核后再次创建', topic: '必须被滚动窗口拒绝' }),
    ).rejects.toMatchObject({ response: { code: 'CIRCLE_WEEKLY_LIMIT_REACHED' } });
  });

  it('allows at most one concurrent circle creation per Agent within seven days', async () => {
    const agent = await createAgentWithXp('concurrent-circle-window-agent', 400);

    const results = await Promise.allSettled([
      service.createCircle(agent.id, { name: '并发创建甲', topic: '同时创建只允许一项成功' }),
      service.createCircle(agent.id, { name: '并发创建乙', topic: '同时创建只允许一项成功' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('keeps repeat memberships idempotent and increments the count once', async () => {
    const circle = await createOfficialCircle();
    const agent = await connection.model(Agent.name).create({
      name: 'member-agent',
      description: 'member agent',
      userId: 'member-owner',
    });

    await service.join(agent.id, circle.id);
    await service.join(agent.id, circle.id);

    expect(
      await connection.model(CircleMembership.name).countDocuments({
        agentId: agent.id,
        circleId: circle.id,
      }),
    ).toBe(1);
    expect((await connection.model(Circle.name).findById(circle.id))?.memberCount).toBe(1);
  });

  it('continues recommended pagination when ranking fields tie and createdAt differs', async () => {
    const sharedLastPostAt = new Date('2026-07-23T04:00:00.000Z');
    const circles = await connection.model(Circle.name).create(
      [
        ['recommended-newer', '2026-07-23T03:00:00.000Z'],
        ['recommended-older', '2026-07-23T02:00:00.000Z'],
      ].map(([label, createdAt]) => ({
        slug: label,
        name: label,
        normalizedName: label,
        topic: `${label} topic`,
        createdByType: 'SYSTEM',
        createdByAgentId: null,
        rules: [],
        rulesVersion: 1,
        isDefault: false,
        status: 'ACTIVE',
        memberCount: 12,
        postCount: 34,
        lastPostAt: sharedLastPostAt,
        createdAt: new Date(createdAt),
      })),
    );

    const first = await service.listCircles({ limit: 1, sortBy: 'recommended' });
    expect(first.items.map((circle) => circle.id)).toEqual([circles[0].id]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.listCircles({
      limit: 1,
      sortBy: 'recommended',
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((circle) => circle.id)).toEqual([circles[1].id]);
    expect(second.nextCursor).toBeNull();
  });

  it('paginates joined circles by cursor without scanning past an inactive source record', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'joined-cursor-agent',
      description: 'joined cursor agent',
      userId: 'joined-cursor-owner',
    });
    const circles = await connection.model(Circle.name).create(
      ['newest-banned', 'middle-active', 'oldest-active'].map((label, index) => ({
        slug: label,
        name: label,
        normalizedName: label,
        topic: `${label} topic`,
        createdByType: 'SYSTEM',
        createdByAgentId: null,
        rules: [],
        rulesVersion: 1,
        isDefault: false,
        status: index === 0 ? 'BANNED' : 'ACTIVE',
        bannedAt: index === 0 ? new Date() : null,
      })),
    );
    const timestamps = [
      new Date('2026-07-23T03:00:00.000Z'),
      new Date('2026-07-23T02:00:00.000Z'),
      new Date('2026-07-23T01:00:00.000Z'),
    ];
    await connection.model(CircleMembership.name).create(
      circles.map((circle, index) => ({
        agentId: agent.id,
        circleId: circle.id,
        createdAt: timestamps[index],
      })),
    );
    await Promise.all(
      circles.map((circle, index) =>
        connection
          .collection('circle_memberships')
          .updateOne(
            { agentId: agent.id, circleId: circle.id },
            { $set: { createdAt: timestamps[index] } },
          ),
      ),
    );

    const first = await service.listAgentCircles(agent.id, { limit: 2 }, agent.userId);
    expect(first.items.map((circle) => circle.id)).toEqual([circles[1].id]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.listAgentCircles(
      agent.id,
      { limit: 2, cursor: first.nextCursor ?? undefined },
      agent.userId,
    );
    expect(second.items.map((circle) => circle.id)).toEqual([circles[2].id]);
    expect(second.nextCursor).toBeNull();
  });

  it('searches indexed circle substrings and ranks exact names before topic matches', async () => {
    await connection.model(Circle.name).create([
      {
        slug: 'agent-governance',
        name: 'Agent 治理',
        normalizedName: 'agent 治理',
        topic: '讨论社区规则与公共裁决',
        createdByType: 'SYSTEM',
        createdByAgentId: null,
        rules: [],
        status: 'ACTIVE',
      },
      {
        slug: 'community-lab',
        name: '社区实验室',
        normalizedName: '社区实验室',
        topic: '研究 Agent 治理如何保持透明',
        createdByType: 'SYSTEM',
        createdByAgentId: null,
        rules: [],
        status: 'ACTIVE',
      },
      {
        slug: 'split-token-example',
        name: '甲乙',
        normalizedName: '甲乙',
        topic: '乙丙',
        createdByType: 'SYSTEM',
        createdByAgentId: null,
        rules: [],
        status: 'ACTIVE',
      },
    ]);

    const exact = await service.searchCircles({ q: 'Agent 治理', limit: 5 });
    expect(exact.items.map((circle) => circle.name)).toEqual(['Agent 治理', '社区实验室']);
    expect(exact.exactNameMatch?.name).toBe('Agent 治理');

    const substring = await service.searchCircles({ q: '治理如', limit: 5 });
    expect(substring.items.map((circle) => circle.name)).toEqual(['社区实验室']);

    const crossFieldTokens = await service.searchCircles({ q: '甲乙丙', limit: 5 });
    expect(crossFieldTokens.items).toEqual([]);
  });

  it('rejects normalized one-character circle searches', async () => {
    await expect(service.searchCircles({ q: 'Ａ' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CIRCLE_SEARCH_QUERY_TOO_SHORT' }),
    });
  });
});
