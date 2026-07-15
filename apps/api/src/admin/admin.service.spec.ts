import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AdminAuditLog, AdminAuditLogSchema } from '@/database/schemas/admin-audit-log.schema';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import {
  AgentGovernanceProfile,
  AgentGovernanceProfileSchema,
} from '@/database/schemas/agent-governance-profile.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent } from '@/database/schemas/agent-xp-event.schema';
import { BrowserSession } from '@/database/schemas/browser-session.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import {
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from '@/database/schemas/content-review-request.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { ReportTargetState } from '@/database/schemas/report-target-state.schema';
import {
  AgentGovernanceHistory,
  AgentGovernanceHistorySchema,
} from '@/database/schemas/agent-governance-history.schema';
import { GovernanceVote } from '@/database/schemas/governance-vote.schema';
import { Report } from '@/database/schemas/report.schema';
import { GovernanceCorrection } from '@/database/schemas/governance-correction.schema';
import { User } from '@/database/schemas/user.schema';
import { DatabaseService } from '@/database/database.service';
import { CircleProposalService } from '@/circle/circle-proposal.service';
import { CircleService } from '@/circle/circle.service';
import { ForumService } from '@/forum/forum.service';
import { GovernanceService } from '@/governance/governance.service';
import { GOVERNANCE_HEALTH_LEVEL } from '@/governance/governance.constants';
import { HealthService } from '@/health/health.service';
import { InboxService } from '@/inbox/inbox.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminService } from './admin.service';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';

const ADMIN: AdminPrincipal = {
  userId: 'admin-user',
  username: 'admin',
  browserSessionId: 'admin-session',
};

describe('AdminService moderation paths', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: AdminService;
  const publishedPostId = new Types.ObjectId().toString();
  const forumService = {
    publishReviewedPost: jest.fn().mockResolvedValue(publishedPostId),
  };
  const circleService = {
    publishReviewedCircle: jest.fn(),
    createCircleForAdmin: jest.fn().mockResolvedValue({
      id: 'official-circle-id',
      kind: 'OFFICIAL',
    }),
    serializeCircleForAdmin: jest.fn().mockReturnValue({
      id: 'official-circle-id',
      kind: 'OFFICIAL',
    }),
    getCircleForAdmin: jest.fn(),
    updateCircleForAdmin: jest.fn(),
    recordProposalModerationForAdmin: jest.fn().mockResolvedValue(undefined),
    invalidateActiveCircleIdsCache: jest.fn().mockResolvedValue(undefined),
  };
  const circleProposalService = {
    moderateActiveScopeForAdmin: jest.fn(),
    moderateProposalForAdmin: jest.fn(),
  };
  const inboxService = {
    createForReview: jest.fn().mockResolvedValue(undefined),
    createForGovernanceCase: jest.fn().mockResolvedValue(undefined),
    createForGovernanceCorrection: jest.fn().mockResolvedValue(undefined),
    createForAgentGovernance: jest.fn().mockResolvedValue(undefined),
  };
  const governanceService = {
    resolveCaseForAdmin: jest.fn(),
  };

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
          { name: Agent.name, schema: AgentSchema },
          { name: AgentGovernanceProfile.name, schema: AgentGovernanceProfileSchema },
          { name: AgentGovernanceHistory.name, schema: AgentGovernanceHistorySchema },
          { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
        ]),
      ],
      providers: [
        AdminService,
        AdminAuditService,
        DatabaseService,
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(BrowserSession.name), useValue: {} },
        { provide: getModelToken(AgentProgress.name), useValue: {} },
        { provide: getModelToken(AgentXpEvent.name), useValue: {} },
        { provide: getModelToken(Post.name), useValue: {} },
        { provide: getModelToken(Reply.name), useValue: {} },
        { provide: getModelToken(Circle.name), useValue: {} },
        { provide: getModelToken(CircleProposal.name), useValue: {} },
        { provide: getModelToken(GovernanceCase.name), useValue: {} },
        { provide: getModelToken(GovernanceVote.name), useValue: {} },
        { provide: getModelToken(Report.name), useValue: {} },
        { provide: getModelToken(GovernanceCorrection.name), useValue: {} },
        { provide: getModelToken(ReportTargetState.name), useValue: {} },
        { provide: getQueueToken('view-count'), useValue: {} },
        { provide: HealthService, useValue: {} },
        { provide: ForumService, useValue: forumService },
        { provide: CircleService, useValue: circleService },
        { provide: CircleProposalService, useValue: circleProposalService },
        { provide: InboxService, useValue: inboxService },
        { provide: GovernanceService, useValue: governanceService },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(AdminService);
    await Promise.all([
      connection.model(AdminAuditLog.name).init(),
      connection.model(Agent.name).init(),
      connection.model(AgentGovernanceProfile.name).init(),
      connection.model(ContentReviewRequest.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    forumService.publishReviewedPost.mockResolvedValue(publishedPostId);
    circleService.createCircleForAdmin.mockResolvedValue({
      id: 'official-circle-id',
      kind: 'OFFICIAL',
    });
    circleService.serializeCircleForAdmin.mockReturnValue({
      id: 'official-circle-id',
      kind: 'OFFICIAL',
    });
    circleService.recordProposalModerationForAdmin.mockResolvedValue(undefined);
    await Promise.all([
      connection.model(AdminAuditLog.name).deleteMany({}),
      connection.model(Agent.name).deleteMany({}),
      connection.model(AgentGovernanceProfile.name).deleteMany({}),
      connection.model(ContentReviewRequest.name).deleteMany({}),
      connection.db?.collection('agent_governance_history').deleteMany({}),
    ]);
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
    if (replicaSet) await replicaSet.stop();
  });

  async function createReview(type: 'POST' | 'CIRCLE' = 'POST') {
    return connection.model(ContentReviewRequest.name).create({
      type,
      status: 'PENDING',
      requesterAgentId: 'requester-agent',
      requesterOwnerUserIdSnapshot: 'requester-owner',
      payload:
        type === 'POST'
          ? { title: '审核帖子', content: '等待管理员审核', circleId: 'circle-id' }
          : {
              name: '审核圈子',
              normalizedName: '审核圈子',
              topic: '等待管理员审核',
              creationWeekKey: '2026-W29',
            },
      activeKey: type === 'POST' ? null : 'CIRCLE:requester-agent:2026-W29',
      pendingNameKey: type === 'POST' ? null : '审核圈子',
    });
  }

  it('publishes approved content once and records the result in inbox and operation log', async () => {
    const request = await createReview();

    const result = await service.decideContentReview(ADMIN, request.id, {
      decision: 'APPROVE',
    });

    expect(result).toMatchObject({
      id: request.id,
      status: 'APPROVED',
      publishedTargetId: publishedPostId,
    });
    expect(forumService.publishReviewedPost).toHaveBeenCalledTimes(1);
    expect(inboxService.createForReview).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewRequestId: request.id,
        recipientAgentId: 'requester-agent',
        status: 'APPROVED',
      }),
      expect.anything(),
    );
    expect(await connection.model(AdminAuditLog.name).findOne()).toMatchObject({
      action: 'CONTENT_REVIEW_APPROVED',
      targetId: request.id,
      reason: null,
    });
    await expect(
      service.decideContentReview(ADMIN, request.id, { decision: 'APPROVE' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a useful reason for rejection and does not publish rejected content', async () => {
    const request = await createReview();
    await expect(
      service.decideContentReview(ADMIN, request.id, {
        decision: 'REJECT',
        reason: '不行',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await service.decideContentReview(ADMIN, request.id, {
      decision: 'REJECT',
      reason: '内容不符合发布要求',
    });

    expect(result).toMatchObject({
      status: 'REJECTED',
      decisionReason: '内容不符合发布要求',
      publishedTargetId: null,
    });
    expect(forumService.publishReviewedPost).not.toHaveBeenCalled();
    expect(inboxService.createForReview).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REJECTED' }),
      expect.anything(),
    );
  });

  it('passes an official circle kind through the only immediate official creation path', async () => {
    const result = await service.createCircle(ADMIN, {
      name: '官方圈子',
      topic: '官方发布和交流',
      kind: 'OFFICIAL',
    });

    expect(circleService.createCircleForAdmin).toHaveBeenCalledWith(
      { name: '官方圈子', topic: '官方发布和交流', kind: 'OFFICIAL' },
      expect.anything(),
    );
    expect(result).toEqual({ id: 'official-circle-id', kind: 'OFFICIAL' });
    expect(await connection.model(AdminAuditLog.name).findOne()).toMatchObject({
      action: 'CIRCLE_CREATED',
      targetId: 'official-circle-id',
      changes: { kind: 'OFFICIAL' },
    });
  });

  it('records administrator governance decisions with the public reason', async () => {
    const caseId = new Types.ObjectId().toString();
    const resolvedAt = new Date();
    governanceService.resolveCaseForAdmin.mockResolvedValue({
      id: caseId,
      status: 'RESOLVED_VIOLATION',
      resolutionSource: 'ADMIN',
      resolutionReason: '证据充分，直接裁定违规',
      targetAuthorId: 'target-author-agent',
      resolvedAt,
    });

    const result = await service.decideGovernanceCase(ADMIN, caseId, {
      decision: 'VIOLATION',
      reason: '证据充分，直接裁定违规',
    });

    expect(result).toMatchObject({
      id: caseId,
      status: 'RESOLVED_VIOLATION',
      resolutionSource: 'ADMIN',
      resolutionReason: '证据充分，直接裁定违规',
    });
    expect(governanceService.resolveCaseForAdmin).toHaveBeenCalledWith(
      caseId,
      'VIOLATION',
      '证据充分，直接裁定违规',
      ADMIN.userId,
      expect.anything(),
    );
    expect(await connection.model(AdminAuditLog.name).findOne()).toMatchObject({
      action: 'GOVERNANCE_CASE_ADJUDICATED',
      targetId: caseId,
      reason: '证据充分，直接裁定违规',
      changes: { decision: 'VIOLATION' },
    });
  });

  it('bans an Agent without destroying its key and restores the latest pending health level', async () => {
    const agent = await connection.model(Agent.name).create({
      name: 'admin-ban-agent',
      description: '验证管理员封禁不会销毁 Key',
      userId: 'admin-ban-owner',
      secretKeyDigest: 'unchanged-key-digest',
      secretKeyPrefix: 'sk_test',
      secretKeyLastFour: '1234',
      secretKeyCreatedAt: new Date(),
      deletedAt: null,
    });
    await connection.model(AgentGovernanceProfile.name).create({
      agentId: agent.id,
      healthLevel: GOVERNANCE_HEALTH_LEVEL.WARNING,
      violationCount: 0,
    });

    await expect(service.suspendAgent(ADMIN, agent.id, {
      reason: '该 Agent 持续破坏社区正常交流。',
    })).resolves.toMatchObject({
      suspended: true,
      healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
    });

    const [bannedAgent, bannedProfile, banHistory] = await Promise.all([
      connection.model(Agent.name).findById(agent.id),
      connection.model(AgentGovernanceProfile.name).findOne({ agentId: agent.id }),
      connection.model(AgentGovernanceHistory.name).findOne({
        agentId: agent.id,
        source: 'ADMIN_BAN',
      }),
    ]);
    expect(bannedAgent).toMatchObject({
      secretKeyDigest: 'unchanged-key-digest',
      secretKeyPrefix: 'sk_test',
      secretKeyLastFour: '1234',
    });
    expect(bannedProfile).toMatchObject({
      healthLevel: GOVERNANCE_HEALTH_LEVEL.BANNED,
      adminBanRestoreHealthLevel: GOVERNANCE_HEALTH_LEVEL.WARNING,
      activeAdminBanRecordId: banHistory?.id,
    });

    bannedProfile!.adminBanRestoreHealthLevel = GOVERNANCE_HEALTH_LEVEL.PENALIZED;
    await bannedProfile!.save();
    await expect(
      service.unsuspendAgent(ADMIN, agent.id, '复核后解除管理员封禁。'),
    ).resolves.toMatchObject({
      suspended: false,
      healthLevel: GOVERNANCE_HEALTH_LEVEL.PENALIZED,
    });

    const [restoredAgent, restoredProfile] = await Promise.all([
      connection.model(Agent.name).findById(agent.id),
      connection.model(AgentGovernanceProfile.name).findOne({ agentId: agent.id }),
    ]);
    expect(restoredAgent?.secretKeyDigest).toBe('unchanged-key-digest');
    expect(restoredProfile).toMatchObject({
      healthLevel: GOVERNANCE_HEALTH_LEVEL.PENALIZED,
      activeAdminBanRecordId: null,
      adminBanRestoreHealthLevel: null,
    });
    expect(inboxService.createForAgentGovernance).toHaveBeenCalledTimes(2);
  });

  it('terminates proposals only in the administrator circle scope that actually changed', async () => {
    const circleId = new Types.ObjectId().toString();
    const before = {
      id: circleId,
      topic: '原圈子简介',
      topicVersion: 3,
      rules: [{ id: 'rule-1', text: '原规则' }],
      rulesVersion: 4,
    };
    const updated = {
      ...before,
      topic: '新的圈子简介',
      topicVersion: 4,
    };
    const moderatedProposal = {
      id: new Types.ObjectId().toString(),
      circleId,
      scope: 'TOPIC',
      status: 'MODERATED',
      currentRevisionNumber: 2,
    };
    circleService.getCircleForAdmin.mockResolvedValue(before);
    circleProposalService.moderateActiveScopeForAdmin.mockImplementation(
      async (_circleId: string, scope: string) => (
        scope === 'TOPIC' ? moderatedProposal : null
      ),
    );
    circleService.updateCircleForAdmin.mockResolvedValue(updated);
    circleService.serializeCircleForAdmin.mockReturnValue(updated);

    await service.updateCircle(ADMIN, circleId, {
      topic: { value: '新的圈子简介', expectedVersion: 3 },
      reason: '管理员修正圈子简介并公开保留记录。',
    });

    expect(circleProposalService.moderateActiveScopeForAdmin).toHaveBeenCalledTimes(1);
    expect(circleProposalService.moderateActiveScopeForAdmin).toHaveBeenCalledWith(
      circleId,
      'TOPIC',
      '管理员修正圈子简介并公开保留记录。',
      expect.anything(),
    );
    expect(circleService.updateCircleForAdmin).toHaveBeenCalledWith(
      circleId,
      expect.objectContaining({
        topic: { value: '新的圈子简介', expectedVersion: 3 },
        rules: undefined,
      }),
      expect.anything(),
    );
    expect(circleService.recordProposalModerationForAdmin).toHaveBeenCalledWith(
      moderatedProposal,
      '管理员修正圈子简介并公开保留记录。',
      expect.anything(),
    );
  });

  it('uses the same visible-text normalization before deciding which proposal scope changed', async () => {
    const circleId = new Types.ObjectId().toString();
    const before = {
      id: circleId,
      topic: '原 圈子 简介',
      topicVersion: 3,
      rules: [{ id: 'rule-1', text: '原规则' }],
      rulesVersion: 4,
    };
    const updated = {
      ...before,
      rules: [{ id: 'rule-1', text: '新规则' }],
      rulesVersion: 5,
    };
    circleService.getCircleForAdmin.mockResolvedValue(before);
    circleProposalService.moderateActiveScopeForAdmin.mockResolvedValue(null);
    circleService.updateCircleForAdmin.mockResolvedValue(updated);
    circleService.serializeCircleForAdmin.mockReturnValue(updated);

    await service.updateCircle(ADMIN, circleId, {
      topic: { value: '  原　圈子\u200B   简介  ', expectedVersion: 3 },
      rules: { value: [{ id: 'rule-1', text: '新规则' }], expectedVersion: 4 },
      reason: '只更新规则，不应误终止简介提案。',
    });

    expect(circleProposalService.moderateActiveScopeForAdmin).toHaveBeenCalledTimes(1);
    expect(circleProposalService.moderateActiveScopeForAdmin).toHaveBeenCalledWith(
      circleId,
      'RULES',
      '只更新规则，不应误终止简介提案。',
      expect.anything(),
    );
    expect(circleService.updateCircleForAdmin).toHaveBeenCalledWith(
      circleId,
      expect.objectContaining({
        topic: undefined,
        rules: { value: [{ id: 'rule-1', text: '新规则' }], expectedVersion: 4 },
      }),
      expect.anything(),
    );
  });
});
