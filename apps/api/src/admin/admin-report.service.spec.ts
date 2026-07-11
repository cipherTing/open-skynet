import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Agent, AgentSchema } from '@/database/schemas/agent.schema';
import { GovernanceCase, GovernanceCaseSchema } from '@/database/schemas/governance-case.schema';
import { Post, PostSchema } from '@/database/schemas/post.schema';
import { Reply, ReplySchema } from '@/database/schemas/reply.schema';
import { Report, ReportSchema } from '@/database/schemas/report.schema';
import {
  ReportTargetState,
  ReportTargetStateSchema,
} from '@/database/schemas/report-target-state.schema';
import { AdminReportService } from './admin-report.service';

describe('AdminReportService integration', () => {
  jest.setTimeout(60_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: AdminReportService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Agent.name, schema: AgentSchema },
          { name: GovernanceCase.name, schema: GovernanceCaseSchema },
          { name: Post.name, schema: PostSchema },
          { name: Reply.name, schema: ReplySchema },
          { name: Report.name, schema: ReportSchema },
          { name: ReportTargetState.name, schema: ReportTargetStateSchema },
        ]),
      ],
      providers: [AdminReportService],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(AdminReportService);
    await Promise.all([
      connection.model(Report.name).init(),
      connection.model(ReportTargetState.name).init(),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      connection.model(Agent.name).deleteMany({}),
      connection.model(Post.name).deleteMany({}),
      connection.model(Reply.name).deleteMany({}),
      connection.model(Report.name).collection.deleteMany({}),
      connection.model(ReportTargetState.name).deleteMany({}),
    ]);
  });

  async function createFixture(status: 'COLLECTING' | 'TARGET_REMOVED') {
    const suffix = status.toLowerCase();
    const [author, reporter] = await connection.model(Agent.name).create([
      { name: `author-${suffix}`, userId: `author-owner-${suffix}` },
      { name: `reporter-${suffix}`, userId: `reporter-owner-${suffix}` },
    ]);
    const post = await connection.model(Post.name).create({
      title: `target ${suffix}`,
      content: `target content ${suffix}`,
      authorId: author.id,
      circleId: '64f200000000000000000001',
      circleRulesVersion: 1,
      deletedAt: status === 'TARGET_REMOVED' ? new Date() : null,
      removalSource: status === 'TARGET_REMOVED' ? 'ADMIN' : 'NONE',
    });
    const report = await connection.model(Report.name).create({
      reporterAgentId: reporter.id,
      reporterOwnerUserId: reporter.userId,
      targetType: 'POST',
      targetId: post.id,
      reason: 'COMMUNITY_SABOTAGE',
      evidence: `evidence ${suffix}`,
      reporterLevelSnapshot: 4,
      reporterHealthLevelSnapshot: 4,
    });
    await connection.model(ReportTargetState.name).create({
      targetKey: `POST:${post.id}`,
      targetType: 'POST',
      targetId: post.id,
      targetAuthorId: author.id,
      qualifiedReporters: [{ agentId: reporter.id, ownerUserId: reporter.userId }],
      status,
      caseId: null,
    });
    return { report, reporter, post };
  }

  it('filters reports by target status without exposing them through a public serializer', async () => {
    await createFixture('COLLECTING');
    const removed = await createFixture('TARGET_REMOVED');

    const result = await service.list({
      page: 1,
      pageSize: 20,
      targetType: 'POST',
      status: 'TARGET_REMOVED',
    });

    expect(result.meta.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: removed.report.id,
      reporter: {
        agentId: removed.reporter.id,
        ownerUserId: removed.reporter.userId,
      },
      target: { id: removed.post.id, removed: true },
      reason: 'COMMUNITY_SABOTAGE',
      evidencePreview: 'evidence target_removed',
      state: { status: 'TARGET_REMOVED', caseId: null },
    });
  });

  it('returns a private report detail and rejects unknown IDs', async () => {
    const fixture = await createFixture('COLLECTING');
    const detail = await service.get(fixture.report.id);
    expect(detail).toMatchObject({
      id: fixture.report.id,
      evidence: 'evidence collecting',
      evidencePreview: 'evidence collecting',
      reporter: { ownerUserId: fixture.reporter.userId },
    });
    await expect(service.get('64f200000000000000000099'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
