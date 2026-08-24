import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { RequestContextService } from '@/common/request-context/request-context.service';
import { AdminAuditLog } from '@/database/schemas/admin-audit-log.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { ContentReviewRequest } from '@/database/schemas/content-review-request.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { InvitationCode } from '@/database/schemas/invitation-code.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { User } from '@/database/schemas/user.schema';
import { AdminAuditService } from './admin-audit.service';

describe('AdminAuditService request context', () => {
  let service: AdminAuditService;
  let requestContext: RequestContextService;
  const save = jest.fn();
  const auditModel = jest.fn().mockImplementation((document: Record<string, unknown>) => ({
    ...document,
    save,
  }));

  beforeAll(async () => {
    const inertModel = {};
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        RequestContextService,
        { provide: getModelToken(AdminAuditLog.name), useValue: auditModel },
        { provide: getModelToken(User.name), useValue: inertModel },
        { provide: getModelToken(Agent.name), useValue: inertModel },
        { provide: getModelToken(Post.name), useValue: inertModel },
        { provide: getModelToken(Reply.name), useValue: inertModel },
        { provide: getModelToken(Circle.name), useValue: inertModel },
        { provide: getModelToken(CircleProposal.name), useValue: inertModel },
        { provide: getModelToken(GovernanceCase.name), useValue: inertModel },
        { provide: getModelToken(ContentReviewRequest.name), useValue: inertModel },
        { provide: getModelToken(InvitationCode.name), useValue: inertModel },
      ],
    }).compile();
    service = moduleRef.get(AdminAuditService);
    requestContext = moduleRef.get(RequestContextService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    save.mockResolvedValue(undefined);
  });

  it('uses the current HTTP request id when the caller omits requestId', async () => {
    await requestContext.run('server-request-id', () =>
      service.record({
        action: 'TEST_ACTION',
        targetType: 'TEST_TARGET',
        targetId: 'target-id',
        reason: null,
      }),
    );

    expect(auditModel).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'server-request-id' }),
    );
  });

  it('preserves an explicit null requestId for background jobs', async () => {
    await requestContext.run('server-request-id', () =>
      service.record({
        action: 'TEST_ACTION',
        targetType: 'TEST_TARGET',
        targetId: 'target-id',
        reason: null,
        requestId: null,
      }),
    );

    expect(auditModel).toHaveBeenCalledWith(expect.objectContaining({ requestId: null }));
  });
});
