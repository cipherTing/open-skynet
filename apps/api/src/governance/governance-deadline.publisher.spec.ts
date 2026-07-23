import { getQueueToken } from '@nestjs/bullmq';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import { GovernanceCase, GovernanceCaseSchema } from '@/database/schemas/governance-case.schema';
import { GOVERNANCE_CASE_STATUS } from './governance.constants';
import {
  GOVERNANCE_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
  GOVERNANCE_DEADLINE_CONTROL_JOB_PRIORITY,
  GOVERNANCE_DEADLINE_JOB_PRIORITY,
  GOVERNANCE_DEADLINE_COMPLETED_RETENTION,
  GOVERNANCE_DEADLINE_FAILED_RETENTION,
  GOVERNANCE_DEADLINE_JOB_KINDS,
  GOVERNANCE_DEADLINE_QUEUE,
  getGovernanceDeadlineDeduplicationId,
} from './governance-deadline.constants';
import { GovernanceDeadlinePublisher } from './governance-deadline.publisher';

function collectIndexNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectIndexNames);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    key === 'indexName' && typeof nested === 'string' ? [nested] : collectIndexNames(nested),
  );
}

describe('GovernanceDeadlinePublisher', () => {
  jest.setTimeout(60_000);
  let mongo: MongoMemoryServer;
  let moduleRef: TestingModule;
  let connection: Connection;
  let caseModel: Model<GovernanceCase>;
  let publisher: GovernanceDeadlinePublisher;
  const queue = {
    upsertJobScheduler: jest.fn(),
    add: jest.fn(),
    addBulk: jest.fn(),
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongo.getUri()),
        MongooseModule.forFeature([{ name: GovernanceCase.name, schema: GovernanceCaseSchema }]),
      ],
      providers: [
        GovernanceDeadlinePublisher,
        { provide: getQueueToken(GOVERNANCE_DEADLINE_QUEUE), useValue: queue },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    caseModel = moduleRef.get<Model<GovernanceCase>>(getModelToken(GovernanceCase.name));
    publisher = moduleRef.get(GovernanceDeadlinePublisher);
  });

  beforeEach(async () => {
    await connection.model(GovernanceCase.name).deleteMany({});
    queue.upsertJobScheduler.mockReset();
    queue.add.mockReset();
    queue.addBulk.mockReset();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
    queue.add.mockResolvedValue(undefined);
    queue.addBulk.mockResolvedValue([]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongo.stop();
  });

  function createDeadlineCase(
    index: number,
    overrides: Record<string, object | string | number | Date | null> = {},
  ) {
    const now = new Date();
    return {
      _id: new Types.ObjectId(),
      targetType: 'POST',
      targetId: new Types.ObjectId().toString(),
      targetContentVersion: 1,
      round: 1,
      targetAuthorId: `author-${index}`,
      reporterAgentIds: ['reporter-1', 'reporter-2', 'reporter-3'],
      reporterOwnerUserIds: ['owner-1', 'owner-2', 'owner-3'],
      targetAuthorOwnerUserId: `author-owner-${index}`,
      targetSnapshot: {},
      status: GOVERNANCE_CASE_STATUS.OPEN,
      resolution: null,
      triggerScore: 3,
      triggerThreshold: 3,
      violationTally: 0,
      notViolationTally: 0,
      openedAt: now,
      firstReviewAt: now,
      normalDeadlineAt: now,
      emergencyDeadlineAt: now,
      nextTransitionAt: new Date(now.getTime() + 60_000),
      deadlineVersion: 1,
      deadlinePublishedVersion: 0,
      deadlineScheduleDispatchAt: new Date(now.getTime() - 1_000),
      deadlineCompensationDispatchAt: new Date(now.getTime() + 60_000),
      activeKey: `active-${index}`,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('registers independent one-second publication and ten-second compensation schedulers', async () => {
    await publisher.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(queue.upsertJobScheduler.mock.calls[0][1]).toEqual({ every: 1_000 });
    expect(queue.upsertJobScheduler.mock.calls[1][1]).toEqual({ every: 10_000 });
    expect(queue.upsertJobScheduler.mock.calls[0][2].opts).toMatchObject({
      attempts: 5,
      priority: GOVERNANCE_DEADLINE_CONTROL_JOB_PRIORITY,
      backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
      removeOnComplete: GOVERNANCE_DEADLINE_COMPLETED_RETENTION,
      removeOnFail: GOVERNANCE_DEADLINE_FAILED_RETENTION,
    });
  });

  it('uses query-aligned indexes for pending publication and due compensation', async () => {
    await caseModel.init();
    const now = new Date();
    const [publicationPlan, compensationPlan] = await Promise.all([
      caseModel.collection
        .find({
          status: { $in: [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY] },
          deadlineScheduleDispatchAt: { $lte: now },
          $expr: { $lt: ['$deadlinePublishedVersion', '$deadlineVersion'] },
        })
        .sort({ deadlineScheduleDispatchAt: 1, _id: 1 })
        .limit(50)
        .explain('queryPlanner'),
      caseModel.collection
        .find({
          status: { $in: [GOVERNANCE_CASE_STATUS.OPEN, GOVERNANCE_CASE_STATUS.EMERGENCY] },
          nextTransitionAt: { $lte: now },
          deadlineCompensationDispatchAt: { $lte: now },
          $or: [
            { deadlineCompensationClaimExpiresAt: null },
            { deadlineCompensationClaimExpiresAt: { $lte: now } },
          ],
        })
        .sort({ deadlineCompensationDispatchAt: 1, _id: 1 })
        .limit(50)
        .explain('queryPlanner'),
    ]);

    expect(collectIndexNames(publicationPlan)).toContain(
      'status_1_deadlineScheduleDispatchAt_1__id_1',
    );
    expect(collectIndexNames(compensationPlan)).toContain(
      'status_1_deadlineCompensationDispatchAt_1__id_1',
    );
  });

  it('claims and publishes at most fifty pending cases before conditionally marking them', async () => {
    await connection
      .model(GovernanceCase.name)
      .collection.insertMany(Array.from({ length: 55 }, (_, index) => createDeadlineCase(index)));

    await publisher.publishPendingBatch();

    const firstBatch = queue.addBulk.mock.calls[0][0];
    expect(firstBatch).toHaveLength(50);
    expect(firstBatch[0]).toMatchObject({
      data: { kind: GOVERNANCE_DEADLINE_JOB_KINDS.ADVANCE_CASE, deadlineVersion: 1 },
      opts: {
        attempts: 5,
        priority: GOVERNANCE_DEADLINE_JOB_PRIORITY,
        deduplication: { id: expect.stringContaining('governance-case-') },
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
        removeOnComplete: GOVERNANCE_DEADLINE_COMPLETED_RETENTION,
        removeOnFail: GOVERNANCE_DEADLINE_FAILED_RETENTION,
      },
    });
    expect(
      await connection.model(GovernanceCase.name).countDocuments({ deadlinePublishedVersion: 1 }),
    ).toBe(50);
    expect(
      await connection.model(GovernanceCase.name).countDocuments({
        deadlinePublishedVersion: 1,
        deadlineScheduleDispatchAt: null,
      }),
    ).toBe(50);

    await publisher.publishPendingBatch();
    expect(queue.addBulk.mock.calls[1][0]).toHaveLength(5);
  });

  it('releases publication claims when BullMQ rejects the batch', async () => {
    const candidate = createDeadlineCase(1);
    await connection.model(GovernanceCase.name).collection.insertOne(candidate);
    queue.addBulk.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(publisher.publishPendingBatch()).rejects.toThrow('redis unavailable');
    const failed = await connection
      .model(GovernanceCase.name)
      .findById(candidate._id)
      .select('+deadlineScheduleClaimToken');
    expect(failed?.deadlinePublishedVersion).toBe(0);
    expect(failed?.deadlineScheduleClaimToken).toBeNull();

    queue.addBulk.mockResolvedValueOnce([]);
    await publisher.publishPendingBatch();
    expect(queue.addBulk).toHaveBeenCalledTimes(2);
  });

  it('redelivers with a new token when marking fails after BullMQ accepts the batch', async () => {
    const candidate = createDeadlineCase(1);
    await connection.model(GovernanceCase.name).collection.insertOne(candidate);
    const realBulkWrite = caseModel.bulkWrite.bind(caseModel);
    const bulkWrite = jest.spyOn(caseModel, 'bulkWrite');
    bulkWrite.mockImplementationOnce((operations, options) => realBulkWrite(operations, options));
    bulkWrite.mockRejectedValueOnce(new Error('marking failed'));

    await expect(publisher.publishPendingBatch()).rejects.toThrow('marking failed');
    const firstJob = queue.addBulk.mock.calls[0][0][0];
    bulkWrite.mockRestore();
    await publisher.publishPendingBatch();
    const secondJob = queue.addBulk.mock.calls[1][0][0];

    expect(firstJob.opts.jobId).not.toBe(secondJob.opts.jobId);
    expect(firstJob.data.deliveryToken).not.toBe(secondJob.data.deliveryToken);
    expect(await connection.model(GovernanceCase.name).findById(candidate._id)).toMatchObject({
      deadlinePublishedVersion: 1,
    });
  });

  it('does not duplicate an outstanding compensation delivery', async () => {
    const now = new Date();
    const candidate = createDeadlineCase(1, {
      nextTransitionAt: new Date(now.getTime() - 1_000),
      deadlinePublishedVersion: 1,
      deadlineCompensationDispatchAt: new Date(now.getTime() - 1_000),
    });
    await connection.model(GovernanceCase.name).collection.insertOne(candidate);

    await publisher.publishCompensationBatch();
    const firstJob = queue.addBulk.mock.calls[0][0][0];
    const firstStored = await connection
      .model(GovernanceCase.name)
      .findById(candidate._id)
      .select(
        '+deadlineCompensationClaimToken +deadlineCompensationClaimExpiresAt +deadlineCompensationDeliveryToken',
      )
      .exec();
    expect(firstStored?.deadlineCompensationDeliveryToken).toBe(firstJob.data.deliveryToken);
    expect(firstStored?.deadlineCompensationClaimToken).toBeNull();
    expect(firstStored?.deadlineCompensationClaimExpiresAt).toBeNull();
    expect(firstStored?.deadlineCompensationDispatchAt?.getTime()).toBeGreaterThan(now.getTime());
    expect(firstJob.opts.deduplication).toEqual({
      id: getGovernanceDeadlineDeduplicationId(candidate._id.toString(), 1),
    });
    await publisher.publishCompensationBatch();
    expect(queue.addBulk).toHaveBeenCalledTimes(1);

    await connection.model(GovernanceCase.name).findByIdAndUpdate(candidate._id, {
      deadlineCompensationDispatchAt: new Date(Date.now() - 1_000),
    });
    await publisher.publishCompensationBatch();
    const secondJob = queue.addBulk.mock.calls[1][0][0];

    expect(firstJob.opts.jobId).not.toBe(secondJob.opts.jobId);
    expect(firstJob.data.deliveryToken).not.toBe(secondJob.data.deliveryToken);
    expect(firstJob.data).toMatchObject({
      kind: GOVERNANCE_DEADLINE_JOB_KINDS.ADVANCE_CASE,
      caseId: candidate._id.toString(),
      deadlineVersion: 1,
    });
  });

  it('releases a compensation delivery claim when BullMQ rejects the batch', async () => {
    const candidate = createDeadlineCase(1, {
      nextTransitionAt: new Date(Date.now() - 1_000),
      deadlinePublishedVersion: 1,
      deadlineCompensationDispatchAt: new Date(Date.now() - 1_000),
    });
    await connection.model(GovernanceCase.name).collection.insertOne(candidate);
    queue.addBulk.mockRejectedValueOnce(new Error('compensation queue unavailable'));

    await expect(publisher.publishCompensationBatch()).rejects.toThrow(
      'compensation queue unavailable',
    );
    const failed = await connection
      .model(GovernanceCase.name)
      .findById(candidate._id)
      .select('+deadlineCompensationClaimToken +deadlineCompensationDeliveryToken');
    expect(failed).toMatchObject({
      deadlineCompensationClaimToken: null,
      deadlineCompensationDeliveryToken: null,
    });

    queue.addBulk.mockResolvedValueOnce([]);
    await publisher.publishCompensationBatch();
    expect(queue.addBulk).toHaveBeenCalledTimes(2);
  });

  it('publishes 105 overdue cases in three bounded compensation batches', async () => {
    const dueAt = new Date(Date.now() - 1_000);
    await connection.model(GovernanceCase.name).collection.insertMany(
      Array.from({ length: 105 }, (_, index) =>
        createDeadlineCase(index, {
          nextTransitionAt: dueAt,
          deadlinePublishedVersion: 1,
          deadlineCompensationDispatchAt: dueAt,
        }),
      ),
    );

    await publisher.publishCompensationBatch();

    expect(queue.addBulk.mock.calls[0][0]).toHaveLength(50);
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      { kind: GOVERNANCE_DEADLINE_JOB_KINDS.COMPENSATE },
      expect.objectContaining({
        attempts: 5,
        priority: GOVERNANCE_DEADLINE_CONTROL_JOB_PRIORITY,
        deduplication: {
          id: GOVERNANCE_DEADLINE_COMPENSATION_CONTINUATION_DEDUPLICATION_ID,
          keepLastIfActive: true,
        },
      }),
    );

    await publisher.publishCompensationBatch();
    expect(queue.addBulk.mock.calls[1][0]).toHaveLength(50);
    await publisher.publishCompensationBatch();
    expect(queue.addBulk.mock.calls[2][0]).toHaveLength(5);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(
      await connection.model(GovernanceCase.name).countDocuments({
        deadlineCompensationDeliveryToken: { $type: 'string' },
      }),
    ).toBe(105);
  });
});
