import { createConnection, type Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { runDatabaseMigrations } from './database-migrations';
import { syncDatabaseIndexes } from './database-indexes';
import { DATABASE_MODEL_DEFINITIONS } from './database.module';

jest.setTimeout(120_000);

const LEGACY_POST_INDEX = 'circleId_1_circleVisible_1_createdAt_-1__id_-1';
const CURRENT_POST_INDEX = 'circleId_1_circleVisible_1_pinnedAt_-1_createdAt_-1__id_-1';
const LEGACY_CIRCLE_CREATED_INDEX = 'createdByAgentId_1_createdAt_-1';
const LEGACY_CIRCLE_WEEK_INDEX = 'createdByAgentId_1_creationWeekStartDate_1';
const LEGACY_REVIEW_WEEK_INDEX = 'uq_content_review_circle_requester_week';
const CURRENT_REVIEW_REQUESTER_INDEX = 'idx_content_review_circle_pending_requester_created_at';
const NOTIFICATION_UNIQUE_INDEX = 'uq_notifications_recipient_kind_source';

describe('database migrations', () => {
  let replicaSet: MongoMemoryReplSet;
  let connection: Connection;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri()).asPromise();
  });

  beforeEach(async () => {
    const database = connection.db;
    if (!database) throw new Error('Test database is unavailable');
    await database.dropDatabase();
  });

  afterAll(async () => {
    await connection.close();
    await replicaSet.stop();
  });

  it('automatically normalizes legacy data and contracts only the approved legacy indexes', async () => {
    const database = connection.db;
    if (!database) throw new Error('Test database is unavailable');

    const agentId = new Types.ObjectId();
    const now = new Date();
    const circleCreatedAt = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const reviewCreatedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const deletedCircleCreatedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await database.collection('agents').insertOne({ _id: agentId, name: 'migration-agent' });
    await database
      .collection('posts')
      .createIndex(
        { circleId: 1, circleVisible: 1, createdAt: -1, _id: -1 },
        { partialFilterExpression: { deletedAt: null } },
      );
    await database
      .collection('circles')
      .createIndex(
        { createdByAgentId: 1, createdAt: -1 },
        { partialFilterExpression: { deletedAt: null, createdByAgentId: { $type: 'string' } } },
      );
    await database.collection('circles').createIndex(
      { createdByAgentId: 1, creationWeekStartDate: 1 },
      {
        unique: true,
        partialFilterExpression: {
          deletedAt: null,
          createdByAgentId: { $type: 'string' },
          creationWeekStartDate: { $type: 'string' },
        },
      },
    );
    await database.collection('content_review_requests').createIndex(
      { type: 1, status: 1, requesterAgentId: 1, 'payload.creationWeekStartDate': 1 },
      {
        unique: true,
        name: LEGACY_REVIEW_WEEK_INDEX,
        partialFilterExpression: { type: 'CIRCLE', status: 'PENDING' },
      },
    );
    await database.collection('circles').insertOne({
      createdByAgentId: agentId.toString(),
      status: 'ACTIVE',
      deletedAt: null,
      creationWeekStartDate: '2026-09-01',
      createdAt: circleCreatedAt,
    });
    await database.collection('circles').insertOne({
      createdByAgentId: agentId.toString(),
      status: 'BANNED',
      deletedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      creationWeekStartDate: '2026-09-01',
      createdAt: deletedCircleCreatedAt,
    });
    await database.collection('content_review_requests').insertOne({
      type: 'CIRCLE',
      status: 'APPROVED',
      requesterAgentId: agentId.toString(),
      payload: { creationWeekStartDate: '2026-09-01' },
      createdAt: reviewCreatedAt,
    });
    await database.collection('content_review_requests').insertMany([
      {
        type: 'CIRCLE',
        status: 'PENDING',
        requesterAgentId: agentId.toString(),
        payload: { creationWeekStartDate: '2026-08-25' },
        createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      },
      {
        type: 'CIRCLE',
        status: 'PENDING',
        requesterAgentId: agentId.toString(),
        payload: { creationWeekStartDate: '2026-09-01' },
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
    ]);
    await database.collection('content_review_requests').insertOne({
      type: 'POST',
      status: 'PENDING',
      requesterAgentId: agentId.toString(),
      payload: { kind: 'POST' },
      createdAt: now,
    });
    await database.collection('posts').insertOne({
      circleId: 'legacy-circle',
      circleVisible: true,
      deletedAt: null,
      createdAt: now,
    });

    await runDatabaseMigrations(connection);

    expect(await database.collection('agents').findOne({ _id: agentId })).toMatchObject({
      lastCircleCreatedAt: deletedCircleCreatedAt,
    });
    const contractedPostIndexes = await database.collection('posts').indexes();
    expect(contractedPostIndexes.map((index) => index.name)).toContain(CURRENT_POST_INDEX);
    expect(contractedPostIndexes.map((index) => index.name)).not.toContain(LEGACY_POST_INDEX);
    const contractedCircleIndexes = await database.collection('circles').indexes();
    expect(contractedCircleIndexes.map((index) => index.name)).not.toEqual(
      expect.arrayContaining([LEGACY_CIRCLE_CREATED_INDEX, LEGACY_CIRCLE_WEEK_INDEX]),
    );
    const contractedReviewIndexes = await database.collection('content_review_requests').indexes();
    expect(contractedReviewIndexes.map((index) => index.name)).toContain(
      CURRENT_REVIEW_REQUESTER_INDEX,
    );
    expect(contractedReviewIndexes.map((index) => index.name)).not.toContain(
      LEGACY_REVIEW_WEEK_INDEX,
    );
    const notificationIndexes = await database.collection('notifications').indexes();
    expect(notificationIndexes.map((index) => index.name)).toContain(NOTIFICATION_UNIQUE_INDEX);

    expect(await database.collection('posts').findOne({ circleId: 'legacy-circle' })).toMatchObject(
      {
        pinnedAt: null,
      },
    );
    expect(
      await database.collection('circles').findOne({ createdByAgentId: agentId.toString() }),
    ).toEqual(
      expect.objectContaining({
        agentPostingEnabled: true,
        agentReplyingEnabled: true,
        postingPolicyVersion: 1,
      }),
    );
    expect(
      await database
        .collection('circles')
        .countDocuments({ creationWeekStartDate: { $exists: true } }),
    ).toBe(0);
    expect(
      await database
        .collection('content_review_requests')
        .countDocuments({ 'payload.creationWeekStartDate': { $exists: true } }),
    ).toBe(0);
    expect(
      await database.collection('content_review_requests').findOne({ type: 'POST' }),
    ).toMatchObject({ payload: { submissionOrigin: 'AGENT' } });

    await expect(runDatabaseMigrations(connection)).resolves.toEqual([]);
  });

  it('refuses to remove a same-name index whose definition is not an approved legacy index', async () => {
    const database = connection.db;
    if (!database) throw new Error('Test database is unavailable');

    await database
      .collection('posts')
      .createIndex(
        { circleId: 1, circleVisible: 1, createdAt: 1, _id: -1 },
        { name: LEGACY_POST_INDEX, partialFilterExpression: { deletedAt: null } },
      );

    await expect(runDatabaseMigrations(connection)).rejects.toThrow(
      'does not match the approved legacy definition',
    );

    expect((await database.collection('posts').indexes()).map((index) => index.name)).toContain(
      LEGACY_POST_INDEX,
    );
  });

  it('does not record a migration when its final schema check fails', async () => {
    const database = connection.db;
    if (!database) throw new Error('Test database is unavailable');

    await expect(
      runDatabaseMigrations(connection, async () => {
        throw new Error('final schema check failed');
      }),
    ).rejects.toThrow('final schema check failed');

    expect(await database.collection('database_migrations').countDocuments()).toBe(0);
    await expect(runDatabaseMigrations(connection)).resolves.toHaveLength(3);
  });

  it('converges the complete schema before recording the migration', async () => {
    await expect(
      runDatabaseMigrations(connection, async (activeConnection) => {
        await syncDatabaseIndexes(activeConnection, DATABASE_MODEL_DEFINITIONS);
      }),
    ).resolves.toHaveLength(3);

    const verification = await syncDatabaseIndexes(connection, DATABASE_MODEL_DEFINITIONS);
    expect(
      verification.every((result) => result.created.length === 0 && result.dropped.length === 0),
    ).toBe(true);
  });
});
