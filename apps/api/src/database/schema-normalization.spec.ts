import mongoose from 'mongoose';
import {
  CONTENT_REVIEW_TYPES,
  ContentReviewRequest,
  ContentReviewRequestSchema,
} from './schemas/content-review-request.schema';
import {
  GovernanceCase,
  GovernanceCaseSchema,
} from './schemas/governance-case.schema';
import {
  HotProjectionWorkItemSchema,
} from './schemas/hot-projection-work-item.schema';
import { AgentXpEvent, AgentXpEventSchema } from './schemas/agent-xp-event.schema';
import { AdminAuditLog, AdminAuditLogSchema } from './schemas/admin-audit-log.schema';
import {
  AgentGovernanceHistory,
  AgentGovernanceHistorySchema,
} from './schemas/agent-governance-history.schema';
import { GovernanceCorrection, GovernanceCorrectionSchema } from './schemas/governance-correction.schema';
import { GovernanceVote, GovernanceVoteSchema } from './schemas/governance-vote.schema';
import { McpIdempotencyRecord, McpIdempotencyRecordSchema } from './schemas/mcp-idempotency-record.schema';
import { SecurityEvent, SecurityEventSchema } from './schemas/security-event.schema';
import { PostRevision, PostRevisionSchema } from './schemas/post-revision.schema';
import { ReplyRevision, ReplyRevisionSchema } from './schemas/reply-revision.schema';
import {
  CircleProposalComment,
  CircleProposalCommentSchema,
} from './schemas/circle-proposal-comment.schema';
import { ReportTargetState, ReportTargetStateSchema } from './schemas/report-target-state.schema';

const testMongoose = new mongoose.Mongoose();
const ContentReviewModel = testMongoose.model(ContentReviewRequest.name, ContentReviewRequestSchema);
const GovernanceCaseModel = testMongoose.model(GovernanceCase.name, GovernanceCaseSchema);
const XpEventModel = testMongoose.model(AgentXpEvent.name, AgentXpEventSchema);
const AuditModel = testMongoose.model(AdminAuditLog.name, AdminAuditLogSchema);
const GovernanceHistoryModel = testMongoose.model(
  AgentGovernanceHistory.name,
  AgentGovernanceHistorySchema,
);
const CorrectionModel = testMongoose.model(GovernanceCorrection.name, GovernanceCorrectionSchema);
const GovernanceVoteModel = testMongoose.model(GovernanceVote.name, GovernanceVoteSchema);
const McpIdempotencyModel = testMongoose.model(
  McpIdempotencyRecord.name,
  McpIdempotencyRecordSchema,
);
const SecurityEventModel = testMongoose.model(SecurityEvent.name, SecurityEventSchema);
const PostRevisionModel = testMongoose.model(PostRevision.name, PostRevisionSchema);
const ReplyRevisionModel = testMongoose.model(ReplyRevision.name, ReplyRevisionSchema);
const ProposalCommentModel = testMongoose.model(
  CircleProposalComment.name,
  CircleProposalCommentSchema,
);
const ReportTargetStateModel = testMongoose.model(ReportTargetState.name, ReportTargetStateSchema);

describe('database schema invariants', () => {
  it('uses a compound fact index for hot projection source identity', () => {
    const indexes = HotProjectionWorkItemSchema.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { sourceType: 1, sourceId: 1 },
          expect.objectContaining({ unique: true }),
        ],
      ]),
    );
    expect(indexes.flatMap(([keys]) => Object.keys(keys))).not.toContain('sourceKey');
  });

  it('rejects a content review payload whose kind does not match its type', async () => {
    const request = new ContentReviewModel({
      type: CONTENT_REVIEW_TYPES.POST,
      requesterAgentId: 'agent-1',
      requesterOwnerUserIdSnapshot: 'owner-1',
      payload: {
        kind: 'CIRCLE',
        name: 'circle',
        normalizedName: 'circle',
        topic: 'topic',
        creationWeekStartDate: '2026-08-10',
      },
    });

    await expect(request.validate()).rejects.toThrow();
  });

  it('rejects invalid or duplicate tags in a post content review payload', async () => {
    const invalidTag = new ContentReviewModel({
      type: CONTENT_REVIEW_TYPES.POST,
      requesterAgentId: 'agent-1',
      requesterOwnerUserIdSnapshot: 'owner-1',
      payload: {
        kind: CONTENT_REVIEW_TYPES.POST,
        title: 'title',
        content: 'content',
        circleId: 'circle-1',
        tags: ['UNKNOWN'],
      },
    });
    const duplicateTag = new ContentReviewModel({
      type: CONTENT_REVIEW_TYPES.POST,
      requesterAgentId: 'agent-1',
      requesterOwnerUserIdSnapshot: 'owner-1',
      payload: {
        kind: CONTENT_REVIEW_TYPES.POST,
        title: 'title',
        content: 'content',
        circleId: 'circle-1',
        tags: ['DISCUSSION', 'DISCUSSION'],
      },
    });

    await expect(invalidTag.validate()).rejects.toThrow();
    await expect(duplicateTag.validate()).rejects.toThrow();
  });

  it('rejects a governance snapshot whose kind does not match the target type', async () => {
    const governanceCase = new GovernanceCaseModel({
      targetType: 'POST',
      targetId: 'post-1',
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: 'agent-1',
      reporterAgentIds: ['agent-2', 'agent-3', 'agent-4'],
      reporterOwnerUserIds: ['owner-2', 'owner-3', 'owner-4'],
      targetAuthorOwnerUserId: 'owner-1',
      targetSnapshot: {
        kind: 'REPLY',
        post: {},
        reply: {},
      },
      triggerScore: 3,
      triggerThreshold: 3,
      openedAt: new Date(),
      firstReviewAt: new Date(),
      normalDeadlineAt: new Date(),
      emergencyDeadlineAt: new Date(),
    });

    await expect(governanceCase.validate()).rejects.toThrow();
  });

  it('accepts a flat proposal-comment governance snapshot', async () => {
    const governanceCase = new GovernanceCaseModel({
      targetType: 'CIRCLE_PROPOSAL_COMMENT',
      targetId: 'comment-1',
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: 'agent-1',
      reporterAgentIds: ['agent-2', 'agent-3', 'agent-4'],
      reporterOwnerUserIds: ['owner-2', 'owner-3', 'owner-4'],
      targetAuthorOwnerUserId: 'owner-1',
      targetSnapshot: {
        kind: 'CIRCLE_PROPOSAL_COMMENT',
        proposal: { id: 'proposal-1', circleId: 'circle-1' },
        comment: {
          id: 'comment-1',
          circleId: 'circle-1',
          revisionNumber: 1,
          content: 'comment content',
          authorId: 'agent-1',
          createdAt: new Date(),
        },
      },
      triggerScore: 3,
      triggerThreshold: 3,
      openedAt: new Date(),
      firstReviewAt: new Date(),
      normalDeadlineAt: new Date(),
      emergencyDeadlineAt: new Date(),
    });

    await expect(governanceCase.validate()).resolves.toBeUndefined();
    expect(governanceCase.targetSnapshot).toMatchObject({
      kind: 'CIRCLE_PROPOSAL_COMMENT',
      comment: { id: 'comment-1', content: 'comment content' },
    });
  });

  it('rejects XP events with unsupported sources or non-integral values', async () => {
    const event = new XpEventModel({
      agentId: 'agent-1',
      sourceType: 'ADMIN_ADJUSTMENT',
      sourceId: 'source-1',
      reasonKey: 'admin-xp-adjustment',
      xp: 1.5,
      occurredAt: new Date(),
    });

    await expect(event.validate()).rejects.toThrow();
  });

  it('accepts half-point governance tallies and rejects unsupported precision', async () => {
    const validCase = new GovernanceCaseModel({
      targetType: 'POST',
      targetId: 'post-1',
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: 'agent-1',
      reporterAgentIds: ['agent-2', 'agent-3', 'agent-4'],
      reporterOwnerUserIds: ['owner-2', 'owner-3', 'owner-4'],
      targetAuthorOwnerUserId: 'owner-1',
      targetSnapshot: {
        kind: 'POST',
        post: {
          id: 'post-1',
          title: 'title',
          content: 'content',
          tags: ['DISCUSSION'],
          contentVersion: 1,
          authorId: 'agent-1',
          createdAt: new Date(),
          circleRules: { circleId: 'circle-1', version: 1, rules: [] },
        },
      },
      triggerScore: 3,
      triggerThreshold: 3,
      violationTally: 1.5,
      notViolationTally: 2.5,
      openedAt: new Date(),
      firstReviewAt: new Date(),
      normalDeadlineAt: new Date(),
      emergencyDeadlineAt: new Date(),
    });

    await expect(validCase.validate()).resolves.toBeUndefined();

    const invalidCase = new GovernanceCaseModel({
      ...validCase.toObject(),
      violationTally: 1.25,
    });
    await expect(invalidCase.validate()).rejects.toThrow();
  });

  it('rejects updates and deletes against the XP ledger', async () => {
    const event = new XpEventModel({
      agentId: 'agent-1',
      sourceType: 'CREATE_REPLY',
      sourceId: 'source-1',
      reasonKey: 'active-action',
      xp: 8,
      occurredAt: new Date(),
    });

    await expect(event.updateOne({ $set: { xp: 9 } })).rejects.toThrow();
    await expect(event.deleteOne()).rejects.toThrow();
  });

  it('rejects updates and deletes against governance votes', async () => {
    const vote = new GovernanceVoteModel({
      caseId: 'case-1',
      voterAgentId: 'agent-1',
      voterOwnerUserIdSnapshot: 'owner-1',
      targetType: 'POST',
      targetId: 'post-1',
      choice: 'VIOLATION',
      weight: 1,
      voterLevel: 4,
      voterHealthLevel: 4,
    });

    await expect(vote.updateOne({ $set: { choice: 'NOT_VIOLATION' } })).rejects.toThrow();
    await expect(vote.deleteOne()).rejects.toThrow();
    await expect(
      GovernanceVoteModel.updateOne(
        { caseId: 'case-1', voterAgentId: 'agent-1' },
        { $set: { choice: 'NOT_VIOLATION' } },
      ).exec(),
    ).rejects.toThrow();
    await expect(
      GovernanceVoteModel.deleteMany({ caseId: 'case-1' }).exec(),
    ).rejects.toThrow();
  });

  it('allows only moderation fields to change on post and reply revision history', async () => {
    const postUpdateOne = PostRevisionModel.collection.updateOne;
    const replyUpdateOne = ReplyRevisionModel.collection.updateOne;
    PostRevisionModel.collection.updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 }) as never;
    ReplyRevisionModel.collection.updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 }) as never;

    await expect(
      PostRevisionModel.updateOne(
        { postId: 'post-1', version: 1, publicContentHiddenAt: null },
        { $set: { publicContentHiddenAt: new Date(), publicContentHideReason: '治理隐藏' } },
      ).exec(),
    ).resolves.toMatchObject({ matchedCount: 1 });
    await expect(
      ReplyRevisionModel.updateOne(
        { replyId: 'reply-1', version: 1, publicContentHiddenAt: null },
        { $set: { publicContentHiddenAt: new Date(), publicContentHideReason: '治理隐藏' } },
      ).exec(),
    ).resolves.toMatchObject({ matchedCount: 1 });

    await expect(
      PostRevisionModel.updateOne(
        { postId: 'post-1', version: 1 },
        { $set: { content: '改写历史正文' } },
      ).exec(),
    ).rejects.toThrow();
    await expect(
      ReplyRevisionModel.updateOne(
        { replyId: 'reply-1', version: 1 },
        { $set: { content: '改写历史正文' } },
      ).exec(),
    ).rejects.toThrow();

    PostRevisionModel.collection.updateOne = postUpdateOne;
    ReplyRevisionModel.collection.updateOne = replyUpdateOne;
  });

  it('allows only hiddenAt to change on proposal comments', async () => {
    const updateOne = ProposalCommentModel.collection.updateOne;
    ProposalCommentModel.collection.updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 }) as never;
    const commentId = new mongoose.Types.ObjectId();

    await expect(
      ProposalCommentModel.updateOne(
        { _id: commentId, hiddenAt: null },
        { $set: { hiddenAt: new Date() } },
      ).exec(),
    ).resolves.toMatchObject({ matchedCount: 1 });
    await expect(
      ProposalCommentModel.updateOne(
        { _id: commentId },
        { $set: { content: '改写历史评论' } },
      ).exec(),
    ).rejects.toThrow();

    ProposalCommentModel.collection.updateOne = updateOne;
  });

  it('rejects updates and deletes against the admin audit ledger', async () => {
    const audit = new AuditModel({
      actorType: 'ADMIN',
      action: 'TEST',
      targetType: 'POST',
      targetId: 'post-1',
      changes: { status: 'updated' },
    });

    await expect(audit.updateOne({ $set: { action: 'CHANGED' } })).rejects.toThrow();
    await expect(audit.deleteOne()).rejects.toThrow();
  });

  it('rejects document deletes against governance history and correction ledgers', async () => {
    const history = new GovernanceHistoryModel({
      agentId: 'agent-1',
      source: 'COMMUNITY_CASE',
      previousHealthLevel: 4,
      nextHealthLevel: 3,
      publicReason: 'valid governance history reason',
      governanceCaseId: 'case-1',
    });
    const correction = new CorrectionModel({
      caseId: 'case-1',
      targetType: 'POST',
      targetId: 'post-1',
      previousRound: 1,
      nextRound: 2,
      action: 'RESTORE_CONTENT',
      publicReason: 'valid correction reason',
      adminUserId: 'admin-1',
    });

    await expect(history.deleteOne()).rejects.toThrow();
    await expect(correction.deleteOne()).rejects.toThrow();
  });

  it('rejects updates to immutable governance target facts and vote facts', async () => {
    new GovernanceCaseModel({
      targetType: 'POST',
      targetId: 'post-1',
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: 'agent-1',
      reporterAgentIds: ['agent-2', 'agent-3', 'agent-4'],
      reporterOwnerUserIds: ['owner-2', 'owner-3', 'owner-4'],
      targetAuthorOwnerUserId: 'owner-1',
      targetSnapshot: {
        kind: 'POST',
        post: {
          id: 'post-1',
          title: 'title',
          content: 'content',
          tags: ['DISCUSSION'],
          contentVersion: 1,
          authorId: 'agent-1',
          createdAt: new Date(),
          circleRules: { circleId: 'circle-1', version: 1, rules: [] },
        },
      },
      triggerScore: 3,
      triggerThreshold: 3,
      openedAt: new Date(),
      firstReviewAt: new Date(),
      normalDeadlineAt: new Date(),
      emergencyDeadlineAt: new Date(),
    });
    expect(GovernanceCaseSchema.path('targetType').options.immutable).toBe(true);
    expect(GovernanceCaseSchema.path('targetId').options.immutable).toBe(true);
    expect(GovernanceCaseSchema.path('targetAuthorId').options.immutable).toBe(true);
    expect(GovernanceCaseSchema.path('targetSnapshot').options.immutable).toBe(true);

    new GovernanceVoteModel({
      caseId: 'case-1',
      voterAgentId: 'agent-1',
      voterOwnerUserIdSnapshot: 'owner-1',
      targetType: 'POST',
      targetId: 'post-1',
      choice: 'VIOLATION',
      weight: 1.5,
      voterLevel: 5,
      voterHealthLevel: 4,
    });
    expect(GovernanceVoteSchema.path('caseId').options.immutable).toBe(true);
    expect(GovernanceVoteSchema.path('voterAgentId').options.immutable).toBe(true);
    expect(GovernanceVoteSchema.path('choice').options.immutable).toBe(true);
    expect(GovernanceVoteSchema.path('weight').options.immutable).toBe(true);
  });

  it('rejects oversized or deeply nested dynamic JSON payloads', async () => {
    const nested: Record<string, unknown> = {};
    let current = nested;
    for (let depth = 0; depth < 8; depth += 1) {
      current.next = {};
      current = current.next as Record<string, unknown>;
    }
    const mcpRecord = new McpIdempotencyModel({
      agentId: 'agent-1',
      toolName: 'forum_read',
      idempotencyKey: 'key-1',
      inputHash: 'hash-1',
      status: 'COMPLETED',
      result: nested,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(mcpRecord.validate()).rejects.toThrow();

    const securityEvent = new SecurityEventModel({
      type: 'TEST',
      severity: 'LOW',
      fingerprintHmac: 'fingerprint',
      route: '/test',
      bucketStart: new Date(),
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      details: { reason: 'x'.repeat(10_001) },
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(securityEvent.validate()).rejects.toThrow();
  });

  it('accepts a bounded MCP idempotency result for a maximum-size Chinese post', async () => {
    const record = new McpIdempotencyModel({
      agentId: 'agent-1',
      toolName: 'forum_write',
      idempotencyKey: 'key-long-post',
      inputHash: 'hash-long-post',
      status: 'COMPLETED',
      result: { value: { post: { content: '帖'.repeat(50_000) } } },
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(record.validate()).resolves.toBeUndefined();
  });

  it('rejects report target states that exceed the qualified reporter threshold', async () => {
    const state = new ReportTargetStateModel({
      targetType: 'POST',
      targetId: 'post-1',
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: 'agent-1',
      qualifiedReporters: [
        { agentId: 'agent-2', ownerUserId: 'owner-2' },
        { agentId: 'agent-3', ownerUserId: 'owner-3' },
        { agentId: 'agent-4', ownerUserId: 'owner-4' },
        { agentId: 'agent-5', ownerUserId: 'owner-5' },
      ],
    });

    await expect(state.validate()).rejects.toThrow();
  });
});
