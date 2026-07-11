import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
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
import { Circle, CircleSchema } from '@/database/schemas/circle.schema';
import {
  CircleMaintenanceLog,
  CircleMaintenanceLogSchema,
} from '@/database/schemas/circle-maintenance-log.schema';
import {
  CircleRuleRevision,
  CircleRuleRevisionSchema,
} from '@/database/schemas/circle-rule-revision.schema';
import {
  CircleSubscription,
  CircleSubscriptionSchema,
} from '@/database/schemas/circle-subscription.schema';
import { FeatureFlag, FeatureFlagSchema } from '@/database/schemas/feature-flag.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { CircleService } from './circle.service';

let sequence = 0;

describe('CircleService integration', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: CircleService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: Circle.name, schema: CircleSchema },
          { name: CircleSubscription.name, schema: CircleSubscriptionSchema },
          { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
          { name: CircleMaintenanceLog.name, schema: CircleMaintenanceLogSchema },
          { name: Post.name, schema: PostSchema },
          { name: FeatureFlag.name, schema: FeatureFlagSchema },
        ]),
      ],
      providers: [DatabaseService, FeatureFlagService, CircleService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(CircleService);
    await Promise.all([
      connection.model(Circle.name).init(),
      connection.model(CircleRuleRevision.name).init(),
      connection.model(CircleMaintenanceLog.name).init(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  async function createEligibleAgent(label: string) {
    sequence += 1;
    const unique = `${label}-${sequence}`;
    const agent = await connection.model(Agent.name).create({
      name: unique,
      description: `${label} description`,
      userId: `${unique}-user`,
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

  async function createCircle(label: string) {
    const agent = await createEligibleAgent(`${label}-steward`);
    const circle = await service.createCircle(agent.id, {
      name: `${label}-${sequence}`,
      topic: `${label} topic`,
    });
    return { agent, circle };
  }

  it('creates the steward, initial rule revision, and public log atomically', async () => {
    const { agent, circle } = await createCircle('atomic');

    expect(circle).toMatchObject({
      stewardAgentId: agent.id,
      rules: [],
      rulesVersion: 1,
      maintenanceVersion: 1,
      pinnedPostIds: [],
      canMaintain: true,
    });
    const revision = await connection.model(CircleRuleRevision.name).findOne({
      circleId: circle.id,
      version: 1,
    });
    const log = await connection.model(CircleMaintenanceLog.name).findOne({
      circleId: circle.id,
      action: 'RULES_UPDATED',
    });
    expect(revision?.rules).toEqual([]);
    expect(log?.actorAgentId).toBe(agent.id);
  });

  it('rejects one of two concurrent stale rule updates', async () => {
    const { agent, circle } = await createCircle('concurrent-rules');
    const results = await Promise.allSettled([
      service.updateCircle(agent.id, circle.id, {
        expectedVersion: 1,
        rules: ['只进行友好交流'],
        publicReason: '发布第一版交流边界',
      }),
      service.updateCircle(agent.id, circle.id, {
        expectedVersion: 1,
        rules: ['禁止以破坏社区为目的'],
        publicReason: '发布另一版交流边界',
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(ConflictException);
    }
    expect(
      await connection.model(CircleRuleRevision.name).countDocuments({
        circleId: circle.id,
      }),
    ).toBe(2);
  });

  it('requires and records a public reason when only the topic changes', async () => {
    const { agent, circle } = await createCircle('topic-log');

    await expect(
      service.updateCircle(agent.id, circle.id, {
        expectedVersion: 1,
        topic: '没有公开说明的新主题',
      }),
    ).rejects.toThrow('必须填写公开原因');

    await service.updateCircle(agent.id, circle.id, {
      expectedVersion: 1,
      topic: '面向工具链协作的新主题',
      publicReason: '让圈子主题和当前讨论保持一致',
    });

    const log = await connection.model(CircleMaintenanceLog.name).findOne({
      circleId: circle.id,
      action: 'CIRCLE_UPDATED',
    });
    expect(log).toMatchObject({
      publicReason: '让圈子主题和当前讨论保持一致',
      metadata: {
        topicChanged: 1,
        rulesChanged: 0,
        previousRulesVersion: 1,
        nextRulesVersion: 1,
      },
    });
  });

  it('enforces steward scope, circle ownership, and the three-pin limit', async () => {
    const { agent: steward, circle } = await createCircle('pins');
    const outsider = await createEligibleAgent('outsider');
    const { circle: otherCircle } = await createCircle('other-circle');
    const posts = await connection.model(Post.name).insertMany(
      Array.from({ length: 4 }, (_, index) => ({
        title: `post-${index}`,
        content: `content-${index}`,
        authorId: steward.id,
        circleId: circle.id,
        circleRulesVersion: 1,
      })),
    );
    const otherPost = await connection.model(Post.name).create({
      title: 'other post',
      content: 'other content',
      authorId: steward.id,
      circleId: otherCircle.id,
      circleRulesVersion: 1,
    });

    await expect(
      service.pinPost(outsider.id, circle.id, posts[0].id, {
        expectedVersion: 1,
        publicReason: '越权尝试',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.pinPost(steward.id, circle.id, otherPost.id, {
        expectedVersion: 1,
        publicReason: '跨圈尝试',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    let version = 1;
    for (const post of posts.slice(0, 3)) {
      const updated = await service.pinPost(steward.id, circle.id, post.id, {
        expectedVersion: version,
        publicReason: `置顶 ${post.title}`,
      });
      version = updated.maintenanceVersion;
    }
    expect(version).toBe(4);
    await expect(
      service.pinPost(steward.id, circle.id, posts[3].id, {
        expectedVersion: version,
        publicReason: '尝试第四个置顶',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps the default circle outside Agent maintenance authority', async () => {
    const agent = await createEligibleAgent('default-outsider');
    const circle = await service.getDefaultCircle();
    await expect(
      service.updateCircle(agent.id, circle.id, {
        expectedVersion: circle.maintenanceVersion,
        topic: '尝试修改默认圈子',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps subscribed circle identities isolated and returns an explicit empty set', async () => {
    const first = await createCircle('subscription-first');
    const second = await createCircle('subscription-second');
    const emptyAgent = await createEligibleAgent('subscription-empty');
    await Promise.all([
      service.subscribe(first.agent.id, first.circle.id),
      service.subscribe(second.agent.id, second.circle.id),
    ]);

    await expect(
      service.getSubscribedCircleIdsForUser(first.agent.userId),
    ).resolves.toEqual([first.circle.id]);
    await expect(
      service.getSubscribedCircleIdsForUser(second.agent.userId),
    ).resolves.toEqual([second.circle.id]);
    await expect(
      service.getSubscribedCircleIdsForUser(emptyAgent.userId),
    ).resolves.toEqual([]);
  });

  it('revokes the old steward immediately after an administrator transfer', async () => {
    const { agent: oldSteward, circle } = await createCircle('transfer');
    const nextSteward = await createEligibleAgent('next-steward');
    const transfer = await service.transferStewardByAdmin(
      circle.id,
      nextSteward.id,
      circle.maintenanceVersion,
      '交接给新的长期维护 Agent',
    );

    expect(transfer).toMatchObject({
      previousStewardAgentId: oldSteward.id,
      stewardAgentId: nextSteward.id,
      maintenanceVersion: 2,
    });
    await expect(
      service.updateCircle(oldSteward.id, circle.id, {
        expectedVersion: 2,
        topic: '旧维护者不应再能修改',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const publicLog = await connection.model(CircleMaintenanceLog.name).findOne({
      circleId: circle.id,
      action: 'STEWARD_TRANSFERRED',
    });
    expect(publicLog).toMatchObject({
      actorType: 'ADMIN',
      actorAgentId: null,
      publicReason: '交接给新的长期维护 Agent',
    });
  });

  it('unpins removed content and releases its capacity with a public log', async () => {
    const { agent, circle } = await createCircle('removed-pin');
    const post = await connection.model(Post.name).create({
      title: 'soon removed',
      content: 'content',
      authorId: agent.id,
      circleId: circle.id,
      circleRulesVersion: 1,
    });
    const pinned = await service.pinPost(agent.id, circle.id, post.id, {
      expectedVersion: 1,
      publicReason: '先置顶验证同步清理',
    });
    expect(pinned.pinnedPostIds).toEqual([post.id]);

    await service.unpinRemovedPost(
      post.id,
      '帖子被移除，系统同步取消置顶',
      'SYSTEM',
    );
    const updated = await connection.model(Circle.name).findById(circle.id);
    expect(updated?.pinnedPostIds).toEqual([]);
    expect(
      await connection.model(CircleMaintenanceLog.name).countDocuments({
        circleId: circle.id,
        action: 'POST_UNPINNED',
        targetPostId: post.id,
      }),
    ).toBe(1);
  });

  it('never allows the default circle to receive a steward', async () => {
    const agent = await createEligibleAgent('default-transfer');
    const circle = await service.getDefaultCircle();
    await expect(
      service.transferStewardByAdmin(
        circle.id,
        agent.id,
        circle.maintenanceVersion,
        '错误转移尝试',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only one administrator transfer for the same circle version', async () => {
    const { circle } = await createCircle('transfer-race');
    const [firstAgent, secondAgent] = await Promise.all([
      createEligibleAgent('transfer-race-first'),
      createEligibleAgent('transfer-race-second'),
    ]);
    const results = await Promise.allSettled([
      service.transferStewardByAdmin(
        circle.id,
        firstAgent.id,
        1,
        '第一位候选维护者',
      ),
      service.transferStewardByAdmin(
        circle.id,
        secondAgent.id,
        1,
        '第二位候选维护者',
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('keeps rule revisions and maintenance logs append-only', async () => {
    const { circle } = await createCircle('append-only');
    const revision = await connection.model(CircleRuleRevision.name).findOne({
      circleId: circle.id,
      version: 1,
    });
    const log = await connection.model(CircleMaintenanceLog.name).findOne({
      circleId: circle.id,
    });
    if (!revision || !log) throw new Error('expected immutable history fixtures');

    revision.rules.push('attempted mutation');
    revision.markModified('rules');
    await expect(revision.save()).rejects.toThrow('只允许追加');
    log.metadata.tampered = 'yes';
    log.markModified('metadata');
    await expect(log.save()).rejects.toThrow('只允许追加');
    await expect(
      connection.model(CircleRuleRevision.name).updateOne(
        { _id: revision.id },
        { $set: { rules: ['attempted replacement'] } },
      ),
    ).rejects.toThrow('只允许追加');
  });

  it('fails startup clearly when an old circle has no immutable rule history', async () => {
    const malformed = await connection.model(Circle.name).create({
      slug: `legacy-${sequence}`,
      name: `legacy-${sequence}`,
      normalizedName: `legacy-${sequence}`,
      topic: 'legacy topic',
      createdByType: 'SYSTEM',
      createdByAgentId: null,
      stewardAgentId: null,
      rules: [],
      rulesVersion: 1,
      maintenanceVersion: 1,
      pinnedPostIds: [],
      isDefault: false,
    });
    await expect(service.onModuleInit()).rejects.toThrow('scripts/db-reset.sh');
    await connection.model(Circle.name).deleteOne({ _id: malformed.id });
  });
});
