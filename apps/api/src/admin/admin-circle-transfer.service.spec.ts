import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
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
import { AdminAuditLog, AdminAuditLogSchema } from '@/database/schemas/admin-audit-log.schema';
import { AdminSession, AdminSessionSchema } from '@/database/schemas/admin-session.schema';
import { BrowserSession, BrowserSessionSchema } from '@/database/schemas/browser-session.schema';
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
import { GovernanceCase, GovernanceCaseSchema } from '@/database/schemas/governance-case.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import {
  ReportTargetState,
  ReportTargetStateSchema,
} from '@/database/schemas/report-target-state.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { CircleService } from '@/circle/circle.service';
import { DatabaseService } from '@/database/database.service';
import {
  GOVERNANCE_HEALTH_LEVEL,
  type GovernanceHealthLevel,
} from '@/governance/governance.constants';
import { HealthService } from '@/health/health.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminService } from './admin.service';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';

const ADMIN: AdminPrincipal = {
  userId: 'admin-user',
  username: 'admin',
  adminSessionId: 'admin-session',
  browserSessionId: 'browser-session',
};

describe('AdminService circle transfer integration', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: AdminService;
  let auditService: AdminAuditService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: User.name, schema: UserSchema },
          { name: BrowserSession.name, schema: BrowserSessionSchema },
          { name: AdminSession.name, schema: AdminSessionSchema },
          { name: AgentProgress.name, schema: AgentProgressSchema },
          { name: AgentXpEvent.name, schema: AgentXpEventSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: Circle.name, schema: CircleSchema },
          { name: CircleSubscription.name, schema: CircleSubscriptionSchema },
          { name: CircleRuleRevision.name, schema: CircleRuleRevisionSchema },
          { name: CircleMaintenanceLog.name, schema: CircleMaintenanceLogSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: ReportTargetState.name, schema: ReportTargetStateSchema },
          { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
          { name: FeatureFlag.name, schema: FeatureFlagSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        FeatureFlagService,
        CircleService,
        AdminAuditService,
        AdminService,
        {
          provide: HealthService,
          useValue: {},
        },
        {
          provide: getQueueToken('view-count'),
          useValue: {},
        },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(AdminService);
    auditService = moduleRef.get(AdminAuditService);
    await Promise.all([
      connection.model(Circle.name).init(),
      connection.model(CircleRuleRevision.name).init(),
      connection.model(CircleMaintenanceLog.name).init(),
      connection.model(AdminAuditLog.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    const modelNames = [
      User.name,
      Agent.name,
      AgentGovernanceProfile.name,
      Circle.name,
      CircleRuleRevision.name,
      CircleMaintenanceLog.name,
      AdminAuditLog.name,
      Post.name,
      ReportTargetState.name,
    ];
    await Promise.all(
      modelNames.map((name) => connection.model(name).collection.deleteMany({})),
    );
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  async function createAgent(
    label: string,
    healthLevel: GovernanceHealthLevel = GOVERNANCE_HEALTH_LEVEL.GOOD,
  ) {
    const user = await connection.model(User.name).create({
      username: `${label}-user`,
      passwordHash: 'test-password-hash',
      role: 'USER',
    });
    const agent = await connection.model(Agent.name).create({
      name: `${label}-agent`,
      description: `${label} description`,
      userId: user.id,
    });
    await connection.model(AgentGovernanceProfile.name).create({
      agentId: agent.id,
      healthLevel,
      violationCount: 0,
    });
    return agent;
  }

  async function createCircle(stewardAgentId: string) {
    const circle = await connection.model(Circle.name).create({
      slug: 'admin-transfer',
      name: 'Admin Transfer',
      normalizedName: 'admin transfer',
      topic: 'transfer test',
      createdByType: 'AGENT',
      createdByAgentId: stewardAgentId,
      stewardAgentId,
      rules: [],
      rulesVersion: 1,
      maintenanceVersion: 1,
      pinnedPostIds: [],
      isDefault: false,
    });
    await connection.model(CircleRuleRevision.name).create({
      circleId: circle.id,
      version: 1,
      rules: [],
      source: 'AGENT',
      actorAgentId: stewardAgentId,
    });
    return circle;
  }

  it('keeps the public reason separate from the private audit reason', async () => {
    const oldSteward = await createAgent('old');
    const nextSteward = await createAgent('next');
    const circle = await createCircle(oldSteward.id);
    await service.transferCircleSteward(ADMIN, circle.id, {
      agentId: nextSteward.id,
      expectedVersion: 1,
      auditReason: '内部调查已确认交接，不可公开',
      publicReason: '维护职责已完成交接',
    });

    const [publicLog, privateAudit] = await Promise.all([
      connection.model(CircleMaintenanceLog.name).findOne({
        circleId: circle.id,
        action: 'STEWARD_TRANSFERRED',
      }),
      connection.model(AdminAuditLog.name).findOne({
        targetId: circle.id,
        action: 'CIRCLE_STEWARD_TRANSFERRED',
      }),
    ]);
    expect(publicLog?.publicReason).toBe('维护职责已完成交接');
    expect(publicLog?.actorAgentId).toBeNull();
    expect(JSON.stringify(publicLog)).not.toContain('内部调查');
    expect(privateAudit?.reason).toBe('内部调查已确认交接，不可公开');
  });

  it('rolls back the steward and public log when private audit persistence fails', async () => {
    const oldSteward = await createAgent('rollback-old');
    const nextSteward = await createAgent('rollback-next');
    const circle = await createCircle(oldSteward.id);
    jest.spyOn(auditService, 'record').mockRejectedValueOnce(new Error('audit failed'));

    await expect(
      service.transferCircleSteward(ADMIN, circle.id, {
        agentId: nextSteward.id,
        expectedVersion: 1,
        auditReason: '内部审计写入失败测试',
        publicReason: '不应被保存的公开原因',
      }),
    ).rejects.toThrow('audit failed');

    const [unchangedCircle, publicLogCount] = await Promise.all([
      connection.model(Circle.name).findById(circle.id),
      connection.model(CircleMaintenanceLog.name).countDocuments({
        circleId: circle.id,
        action: 'STEWARD_TRANSFERRED',
      }),
    ]);
    expect(unchangedCircle?.stewardAgentId).toBe(oldSteward.id);
    expect(unchangedCircle?.maintenanceVersion).toBe(1);
    expect(publicLogCount).toBe(0);
  });

  it('rejects a governance-banned target steward', async () => {
    const oldSteward = await createAgent('healthy-old');
    const banned = await createAgent('banned-next', GOVERNANCE_HEALTH_LEVEL.BANNED);
    const circle = await createCircle(oldSteward.id);

    await expect(
      service.transferCircleSteward(ADMIN, circle.id, {
        agentId: banned.id,
        expectedVersion: 1,
        auditReason: '验证治理健康边界',
        publicReason: '不应成功的交接',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps administrator removal and report target state in the same transaction', async () => {
    const author = await createAgent('content-author');
    const circle = await createCircle(author.id);
    const post = await connection.model(Post.name).create({
      title: 'admin removal target',
      content: '管理员移除与举报状态同步测试',
      authorId: author.id,
      circleId: circle.id,
      circleRulesVersion: 1,
      deletedAt: null,
    });

    await service.setContentRemoved(ADMIN, 'POST', post.id, true, '违规内容人工移除');
    const removedState = await connection.model(ReportTargetState.name).findOne({
      targetType: 'POST',
      targetId: post.id,
    });
    expect(removedState).toMatchObject({ status: 'TARGET_REMOVED', caseId: null });

    await service.setContentRemoved(ADMIN, 'POST', post.id, false, '复核后恢复内容');
    const restoredState = await connection.model(ReportTargetState.name).findById(removedState?.id);
    expect(restoredState?.status).toBe('COLLECTING');
  });
});
