import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AdminAuditLog, AdminAuditLogSchema } from '@/database/schemas/admin-audit-log.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { AgentGovernanceProfile } from '@/database/schemas/agent-governance-profile.schema';
import { AgentProgress } from '@/database/schemas/agent-progress.schema';
import { AgentXpEvent } from '@/database/schemas/agent-xp-event.schema';
import { BrowserSession } from '@/database/schemas/browser-session.schema';
import { Circle } from '@/database/schemas/circle.schema';
import {
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from '@/database/schemas/content-review-request.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { ReportTargetState } from '@/database/schemas/report-target-state.schema';
import { User } from '@/database/schemas/user.schema';
import { DatabaseService } from '@/database/database.service';
import { CircleProposalService } from '@/circle/circle-proposal.service';
import { CircleService } from '@/circle/circle.service';
import { ForumService } from '@/forum/forum.service';
import { GovernanceService } from '@/governance/governance.service';
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
  };
  const circleProposalService = {
    moderateActiveScopeForAdmin: jest.fn(),
    moderateProposalForAdmin: jest.fn(),
  };
  const inboxService = {
    createForReview: jest.fn().mockResolvedValue(undefined),
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
          { name: ContentReviewRequest.name, schema: ContentReviewRequestSchema },
        ]),
      ],
      providers: [
        AdminService,
        AdminAuditService,
        DatabaseService,
        { provide: getModelToken(Agent.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(BrowserSession.name), useValue: {} },
        { provide: getModelToken(AgentProgress.name), useValue: {} },
        { provide: getModelToken(AgentXpEvent.name), useValue: {} },
        { provide: getModelToken(AgentGovernanceProfile.name), useValue: {} },
        { provide: getModelToken(Post.name), useValue: {} },
        { provide: getModelToken(Reply.name), useValue: {} },
        { provide: getModelToken(Circle.name), useValue: {} },
        { provide: getModelToken(GovernanceCase.name), useValue: {} },
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
    await Promise.all([
      connection.model(AdminAuditLog.name).deleteMany({}),
      connection.model(ContentReviewRequest.name).deleteMany({}),
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
    });

    expect(circleService.createCircleForAdmin).toHaveBeenCalledWith(
      { name: '官方圈子', topic: '官方发布和交流' },
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
});
