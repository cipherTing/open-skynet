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
const LEGACY_NOTIFICATION_UNIQUE_INDEX = 'uq_notifications_recipient_kind_source';
const NOTIFICATION_UNIQUE_INDEX = 'uq_notifications_recipient_source';
const NOTIFICATION_SOURCE_IDENTITY_MIGRATION_ID = '20261109_001_rc6_notification_source_identity';
const RC5_MIGRATION_RECORDS = [
  {
    _id: '20260906_001_rc1_to_rc2_circle_policy_and_pinning',
    checksum: '0c1fee49530db7af70b2a6913f955ec3f1a4126654d45671ef93eeccf478802d',
  },
  {
    _id: '20260909_001_rc4_to_rc5_notifications',
    checksum: '9b391a2860cbbce359de23b05d687a7fabc82dd4e74b775d691779ca1c629d68',
  },
  {
    _id: '20260909_002_rc4_to_rc5_circle_reply_policy',
    checksum: '83a68b7b3455e9aad7829386d4e79b4e0f9f8f35c676e456aa953c7cf2413ddd',
  },
] as const;

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

  async function prepareRc5Notifications() {
    const database = connection.db;
    if (!database) throw new Error('Test database is unavailable');
    await database
      .collection<{ _id: string; checksum: string; appliedAt: Date }>('database_migrations')
      .insertMany(
        RC5_MIGRATION_RECORDS.map((record) => ({
          ...record,
          appliedAt: new Date('2026-09-09T12:00:00.000Z'),
        })),
      );
    await database
      .collection('notifications')
      .createIndex(
        { recipientAgentId: 1, kind: 1, sourceType: 1, sourceId: 1 },
        { name: LEGACY_NOTIFICATION_UNIQUE_INDEX, unique: true },
      );
    return database;
  }

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
    expect(notificationIndexes.map((index) => index.name)).not.toContain(
      LEGACY_NOTIFICATION_UNIQUE_INDEX,
    );

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
    await expect(runDatabaseMigrations(connection)).resolves.toHaveLength(4);
  });

  it('converges the complete schema before recording the migration', async () => {
    await expect(
      runDatabaseMigrations(connection, async (activeConnection) => {
        await syncDatabaseIndexes(activeConnection, DATABASE_MODEL_DEFINITIONS);
      }),
    ).resolves.toHaveLength(4);

    const verification = await syncDatabaseIndexes(connection, DATABASE_MODEL_DEFINITIONS);
    expect(
      verification.every((result) => result.created.length === 0 && result.dropped.length === 0),
    ).toBe(true);
  });

  it('upgrades frozen RC5 notification identity without changing stored notifications or prior migration records', async () => {
    const database = await prepareRc5Notifications();
    await database.collection('notifications').insertMany([
      {
        recipientAgentId: 'agent-a',
        kind: 'MENTION',
        sourceType: 'REPLY',
        sourceId: 'reply-a',
        readAt: new Date('2026-09-10T12:00:00.000Z'),
        createdAt: new Date('2026-09-09T12:00:00.000Z'),
        updatedAt: new Date('2026-09-10T12:00:00.000Z'),
      },
      {
        recipientAgentId: 'agent-a',
        kind: 'ANNOUNCEMENT',
        sourceType: 'ANNOUNCEMENT',
        sourceId: 'announcement-a',
        readAt: null,
        createdAt: new Date('2026-09-10T12:00:00.000Z'),
        updatedAt: new Date('2026-09-10T12:00:00.000Z'),
      },
    ]);
    const notificationsBefore = await database
      .collection('notifications')
      .find()
      .sort({ _id: 1 })
      .toArray();
    const recordsBefore = await database
      .collection('database_migrations')
      .find()
      .sort({ _id: 1 })
      .toArray();

    const applied = await runDatabaseMigrations(connection, async (activeConnection) => {
      await syncDatabaseIndexes(activeConnection, DATABASE_MODEL_DEFINITIONS);
    });
    expect(applied.map((migration) => migration.id)).toEqual([
      NOTIFICATION_SOURCE_IDENTITY_MIGRATION_ID,
    ]);
    expect(await database.collection('notifications').find().sort({ _id: 1 }).toArray()).toEqual(
      notificationsBefore,
    );
    expect(
      await database
        .collection('database_migrations')
        .find({ _id: { $in: recordsBefore.map((record) => record._id) } })
        .sort({ _id: 1 })
        .toArray(),
    ).toEqual(recordsBefore);
    const indexes = await database.collection('notifications').indexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({
        name: NOTIFICATION_UNIQUE_INDEX,
        key: { recipientAgentId: 1, sourceType: 1, sourceId: 1 },
        unique: true,
      }),
    );
    expect(indexes.map((index) => index.name)).not.toContain(LEGACY_NOTIFICATION_UNIQUE_INDEX);
    await expect(
      database.collection('notifications').insertOne({
        recipientAgentId: 'agent-a',
        kind: 'REPLY',
        sourceType: 'REPLY',
        sourceId: 'reply-a',
      }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      runDatabaseMigrations(connection, async (activeConnection) => {
        await syncDatabaseIndexes(activeConnection, DATABASE_MODEL_DEFINITIONS);
      }),
    ).resolves.toEqual([]);
  });

  it('preserves cross-kind duplicate notifications and the old index when the tighter identity cannot be created', async () => {
    const database = await prepareRc5Notifications();
    await database.collection('notifications').insertMany([
      {
        recipientAgentId: 'agent-a',
        sourceType: 'REPLY',
        sourceId: 'reply-a',
        kind: 'MENTION',
        readAt: null,
      },
      {
        recipientAgentId: 'agent-a',
        sourceType: 'REPLY',
        sourceId: 'reply-a',
        kind: 'REPLY',
        readAt: new Date('2026-09-10T12:00:00.000Z'),
      },
    ]);
    const before = await database.collection('notifications').find().sort({ _id: 1 }).toArray();
    await expect(runDatabaseMigrations(connection)).rejects.toMatchObject({ code: 11000 });
    expect(await database.collection('notifications').find().sort({ _id: 1 }).toArray()).toEqual(
      before,
    );
    const indexes = await database.collection('notifications').indexes();
    expect(indexes.map((index) => index.name)).toContain(LEGACY_NOTIFICATION_UNIQUE_INDEX);
    expect(indexes.map((index) => index.name)).not.toContain(NOTIFICATION_UNIQUE_INDEX);
    expect(await database.collection('database_migrations').countDocuments()).toBe(3);
    expect(await database.collection('database_migration_locks').countDocuments()).toBe(0);
  });

  it('refuses to drop a notification index whose name matches but definition is unknown', async () => {
    const database = await prepareRc5Notifications();
    await database.collection('notifications').dropIndex(LEGACY_NOTIFICATION_UNIQUE_INDEX);
    await database
      .collection('notifications')
      .createIndex(
        { recipientAgentId: 1, kind: 1, sourceType: 1, sourceId: -1 },
        { name: LEGACY_NOTIFICATION_UNIQUE_INDEX, unique: true },
      );
    await expect(runDatabaseMigrations(connection)).rejects.toThrow(
      'does not match the approved legacy definition',
    );
    expect(
      (await database.collection('notifications').indexes()).map((index) => index.name),
    ).toContain(LEGACY_NOTIFICATION_UNIQUE_INDEX);
    expect(await database.collection('database_migrations').countDocuments()).toBe(3);
  });

  it('keeps unrelated indexes and does not register the identity migration when final schema verification fails', async () => {
    const database = await prepareRc5Notifications();
    await database
      .collection('notifications')
      .createIndex({ actorAgentId: 1 }, { name: 'unknown_notification_actor_index' });
    await expect(
      runDatabaseMigrations(connection, async (activeConnection) => {
        await syncDatabaseIndexes(activeConnection, DATABASE_MODEL_DEFINITIONS);
      }),
    ).rejects.toThrow('Database index drift is not covered by a versioned migration');
    expect(
      (await database.collection('notifications').indexes()).map((index) => index.name),
    ).toContain('unknown_notification_actor_index');
    expect(await database.collection('database_migrations').countDocuments()).toBe(3);
  });

  it('serializes concurrent migration runners while allowing only one to apply each migration', async () => {
    const database = connection.db;
    if (!database) throw new Error('Test database is unavailable');
    const results = await Promise.all([
      runDatabaseMigrations(connection),
      runDatabaseMigrations(connection),
    ]);
    expect(results.map((result) => result.length).sort((left, right) => left - right)).toEqual([
      0, 4,
    ]);
    expect(await database.collection('database_migrations').countDocuments()).toBe(4);
    expect(await database.collection('database_migration_locks').countDocuments()).toBe(0);
    await expect(runDatabaseMigrations(connection)).resolves.toEqual([]);
  });
});
