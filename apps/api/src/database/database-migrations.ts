import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Connection } from 'mongoose';

const MIGRATIONS_COLLECTION = 'database_migrations';
const MIGRATION_LOCKS_COLLECTION = 'database_migration_locks';
const MIGRATION_LOCK_ID = 'schema';
const MIGRATION_LOCK_LEASE_MS = 60_000;
const MIGRATION_LOCK_RENEWAL_MS = 20_000;
const MIGRATION_LOCK_WAIT_MS = 120_000;
const MIGRATION_LOCK_RETRY_MS = 250;
const MIGRATION_BATCH_SIZE = 500;
const RC2_CIRCLE_CREATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const CIRCLE_STATUSES = ['ACTIVE', 'BANNED'] as const;
const CONTENT_REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

type IndexKey = Readonly<Record<string, 1 | -1>>;
type PartialFilterValue = null | string | Readonly<{ $type: string }>;
type PartialFilterExpression = Readonly<Record<string, PartialFilterValue>>;
type MigrationDatabase = NonNullable<Connection['db']>;
type MigrationCollection = ReturnType<MigrationDatabase['collection']>;
type MigrationCursor = ReturnType<MigrationCollection['find']>;
type MigrationDocument = Awaited<ReturnType<MigrationCursor['toArray']>>[number];
type MigrationObjectId = MigrationDocument['_id'];
type MigrationFilter = NonNullable<Parameters<MigrationCollection['find']>[0]>;
type MigrationUpdate = NonNullable<Parameters<MigrationCollection['updateMany']>[1]>;

interface ExpectedIndex {
  collection: string;
  name: string;
  key: IndexKey;
  unique?: true;
  partialFilterExpression?: PartialFilterExpression;
}

interface MigrationRecord {
  _id: string;
  checksum: string;
  appliedAt: Date;
}

interface MigrationLock {
  _id: string;
  owner: string;
  leaseExpiresAt: Date;
}

interface ActualIndex {
  name: string;
  key: Record<string, unknown>;
  unique: boolean;
  sparse: boolean;
  hidden: boolean;
  partialFilterExpression: Record<string, unknown> | null;
  expireAfterSeconds: number | null;
  collation: Record<string, unknown> | null;
}

interface DatabaseMigration {
  id: string;
  checksum: string;
  apply: (context: DatabaseMigrationContext) => Promise<void>;
}

interface DatabaseMigrationContext {
  database: MigrationDatabase;
  now: Date;
  assertLockHeld: () => Promise<void>;
}

interface MigrationLockHandle {
  assertHeld: () => Promise<void>;
}

export type DatabaseMigrationFinalizer = (connection: Connection) => Promise<void>;

export interface DatabaseMigrationResult {
  id: string;
  appliedAt: Date;
}

export interface DatabaseMigrationRequirement {
  id: string;
  checksum: string;
}

const POST_PINNED_INDEX: ExpectedIndex = {
  collection: 'posts',
  name: 'circleId_1_circleVisible_1_pinnedAt_-1_createdAt_-1__id_-1',
  key: { circleId: 1, circleVisible: 1, pinnedAt: -1, createdAt: -1, _id: -1 },
  partialFilterExpression: { deletedAt: null },
};

const CONTENT_REVIEW_REQUESTER_INDEX: ExpectedIndex = {
  collection: 'content_review_requests',
  name: 'idx_content_review_circle_pending_requester_created_at',
  key: { type: 1, status: 1, requesterAgentId: 1, createdAt: -1 },
  partialFilterExpression: { type: 'CIRCLE', status: 'PENDING' },
};

const LEGACY_POST_INDEX: ExpectedIndex = {
  collection: 'posts',
  name: 'circleId_1_circleVisible_1_createdAt_-1__id_-1',
  key: { circleId: 1, circleVisible: 1, createdAt: -1, _id: -1 },
  partialFilterExpression: { deletedAt: null },
};

const LEGACY_CIRCLE_CREATED_INDEX: ExpectedIndex = {
  collection: 'circles',
  name: 'createdByAgentId_1_createdAt_-1',
  key: { createdByAgentId: 1, createdAt: -1 },
  partialFilterExpression: { deletedAt: null, createdByAgentId: { $type: 'string' } },
};

const LEGACY_CIRCLE_WEEK_INDEX: ExpectedIndex = {
  collection: 'circles',
  name: 'createdByAgentId_1_creationWeekStartDate_1',
  key: { createdByAgentId: 1, creationWeekStartDate: 1 },
  unique: true,
  partialFilterExpression: {
    deletedAt: null,
    createdByAgentId: { $type: 'string' },
    creationWeekStartDate: { $type: 'string' },
  },
};

const LEGACY_CONTENT_REVIEW_WEEK_INDEX: ExpectedIndex = {
  collection: 'content_review_requests',
  name: 'uq_content_review_circle_requester_week',
  key: { type: 1, status: 1, requesterAgentId: 1, 'payload.creationWeekStartDate': 1 },
  unique: true,
  partialFilterExpression: { type: 'CIRCLE', status: 'PENDING' },
};

const RC2_MIGRATION_CONTRACT = {
  createdIndexes: [POST_PINNED_INDEX, CONTENT_REVIEW_REQUESTER_INDEX],
  droppedIndexes: [
    LEGACY_POST_INDEX,
    LEGACY_CIRCLE_CREATED_INDEX,
    LEGACY_CIRCLE_WEEK_INDEX,
    LEGACY_CONTENT_REVIEW_WEEK_INDEX,
  ],
  normalizedFields: [
    'posts.pinnedAt',
    'circles.agentPostingEnabled',
    'circles.postingPolicyVersion',
    'content_review_requests.payload.submissionOrigin',
    'agents.lastCircleCreatedAt',
  ],
  removedFields: [
    'circles.creationWeekStartDate',
    'content_review_requests.payload.creationWeekStartDate',
  ],
} as const;

function migrationChecksum(contract: object): string {
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}

const RC2_MIGRATION: DatabaseMigration = {
  id: '20260906_001_rc1_to_rc2_circle_policy_and_pinning',
  checksum: migrationChecksum(RC2_MIGRATION_CONTRACT),
  apply: async (context) => {
    await normalizeRc2Fields(context);
    await context.assertLockHeld();
    await ensureExpectedIndex(context.database, POST_PINNED_INDEX);
    await context.assertLockHeld();
    await ensureExpectedIndex(context.database, CONTENT_REVIEW_REQUESTER_INDEX);
    await context.assertLockHeld();
    await dropExpectedLegacyIndex(context.database, LEGACY_POST_INDEX);
    await context.assertLockHeld();
    await dropExpectedLegacyIndex(context.database, LEGACY_CIRCLE_CREATED_INDEX);
    await context.assertLockHeld();
    await dropExpectedLegacyIndex(context.database, LEGACY_CIRCLE_WEEK_INDEX);
    await context.assertLockHeld();
    await dropExpectedLegacyIndex(context.database, LEGACY_CONTENT_REVIEW_WEEK_INDEX);
    await removeRc1LegacyFields(context);
    await context.assertLockHeld();
    await verifyExpectedIndex(context.database, POST_PINNED_INDEX);
    await context.assertLockHeld();
    await verifyExpectedIndex(context.database, CONTENT_REVIEW_REQUESTER_INDEX);
  },
};

const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [RC2_MIGRATION];

export function getDatabaseMigrationRequirements(): readonly DatabaseMigrationRequirement[] {
  return DATABASE_MIGRATIONS.map(({ id, checksum }) => ({ id, checksum }));
}

function requireDatabase(connection: Connection): MigrationDatabase {
  if (connection.readyState !== 1 || !connection.db) {
    throw new Error('MongoDB connection is not ready');
  }
  return connection.db;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function toActualIndex(value: unknown): ActualIndex {
  const index = requireRecord(value, 'Database index');
  if (typeof index.name !== 'string') throw new Error('Database index is missing its name');
  return {
    name: index.name,
    key: requireRecord(index.key, `Database index ${index.name} key`),
    unique: index.unique === true,
    sparse: index.sparse === true,
    hidden: index.hidden === true,
    partialFilterExpression: index.partialFilterExpression
      ? requireRecord(index.partialFilterExpression, `Database index ${index.name} filter`)
      : null,
    expireAfterSeconds:
      typeof index.expireAfterSeconds === 'number' ? index.expireAfterSeconds : null,
    collation: index.collation
      ? requireRecord(index.collation, `Database index ${index.name} collation`)
      : null,
  };
}

function matchesExpectedIndex(actual: ActualIndex, expected: ExpectedIndex): boolean {
  return (
    isDeepStrictEqual(actual.key, expected.key) &&
    actual.unique === (expected.unique === true) &&
    actual.sparse === false &&
    actual.hidden === false &&
    actual.expireAfterSeconds === null &&
    actual.collation === null &&
    isDeepStrictEqual(actual.partialFilterExpression, expected.partialFilterExpression ?? null)
  );
}

function isNamespaceNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'codeName' in error &&
    error.codeName === 'NamespaceNotFound'
  );
}

async function listIndexes(
  database: MigrationDatabase,
  collectionName: string,
): Promise<ActualIndex[]> {
  try {
    return (await database.collection(collectionName).indexes()).map(toActualIndex);
  } catch (error) {
    if (isNamespaceNotFound(error)) return [];
    throw error;
  }
}

function expectedIndexOptions(expected: ExpectedIndex): {
  name: string;
  unique?: true;
  partialFilterExpression?: PartialFilterExpression;
} {
  return {
    name: expected.name,
    ...(expected.unique ? { unique: true } : {}),
    ...(expected.partialFilterExpression
      ? { partialFilterExpression: expected.partialFilterExpression }
      : {}),
  };
}

async function ensureExpectedIndex(
  database: MigrationDatabase,
  expected: ExpectedIndex,
): Promise<void> {
  const indexes = await listIndexes(database, expected.collection);
  const namedIndex = indexes.find((index) => index.name === expected.name);
  if (namedIndex && !matchesExpectedIndex(namedIndex, expected)) {
    throw new Error(
      `Database index ${expected.collection}:${expected.name} does not match the approved target definition`,
    );
  }
  if (namedIndex || indexes.some((index) => matchesExpectedIndex(index, expected))) return;

  await database
    .collection(expected.collection)
    .createIndex(expected.key, expectedIndexOptions(expected));
}

async function verifyExpectedIndex(
  database: MigrationDatabase,
  expected: ExpectedIndex,
): Promise<void> {
  const indexes = await listIndexes(database, expected.collection);
  if (!indexes.some((index) => matchesExpectedIndex(index, expected))) {
    throw new Error(`Database index ${expected.collection}:${expected.name} was not created`);
  }
}

async function dropExpectedLegacyIndex(
  database: MigrationDatabase,
  expected: ExpectedIndex,
): Promise<void> {
  const indexes = await listIndexes(database, expected.collection);
  const namedIndex = indexes.find((index) => index.name === expected.name);
  if (!namedIndex) return;
  if (!matchesExpectedIndex(namedIndex, expected)) {
    throw new Error(
      `Database index ${expected.collection}:${expected.name} does not match the approved legacy definition`,
    );
  }
  await database.collection(expected.collection).dropIndex(expected.name);
  if ((await listIndexes(database, expected.collection)).some((index) => index.name === expected.name)) {
    throw new Error(`Database index ${expected.collection}:${expected.name} was not removed`);
  }
}

async function updateInBatches(
  collection: MigrationCollection,
  filter: MigrationFilter,
  update: MigrationUpdate,
  assertLockHeld: () => Promise<void>,
): Promise<void> {
  let lastId: MigrationObjectId | null = null;
  while (true) {
    await assertLockHeld();
    const query: MigrationFilter = lastId
      ? { $and: [filter, { _id: { $gt: lastId } }] }
      : filter;
    const batch = await collection
      .find(query)
      .sort({ _id: 1 })
      .limit(MIGRATION_BATCH_SIZE)
      .project({ _id: 1 })
      .toArray();
    if (batch.length === 0) return;

    await assertLockHeld();
    await collection.updateMany(
      { $and: [filter, { _id: { $in: batch.map((document) => document._id) } }] },
      update,
    );
    lastId = batch[batch.length - 1]?._id ?? null;
  }
}

async function mergeLatestCircleCreationTimes(
  database: MigrationDatabase,
  collectionName: 'circles' | 'content_review_requests',
  filter: MigrationFilter,
  agentIdPath: '$createdByAgentId' | '$requesterAgentId',
  assertLockHeld: () => Promise<void>,
): Promise<void> {
  await assertLockHeld();
  await database
    .collection(collectionName)
    .aggregate([
      { $match: filter },
      { $project: { agentId: agentIdPath, createdAt: 1 } },
      { $group: { _id: '$agentId', lastCircleCreatedAt: { $max: '$createdAt' } } },
      {
        $project: {
          _id: {
            $convert: { input: '$_id', to: 'objectId', onError: null, onNull: null },
          },
          lastCircleCreatedAt: 1,
        },
      },
      { $match: { _id: { $ne: null } } },
      {
        $merge: {
          into: 'agents',
          whenMatched: [
            {
              $set: {
                lastCircleCreatedAt: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ['$lastCircleCreatedAt', null] },
                        { $gt: ['$$new.lastCircleCreatedAt', '$lastCircleCreatedAt'] },
                      ],
                    },
                    '$$new.lastCircleCreatedAt',
                    '$lastCircleCreatedAt',
                  ],
                },
              },
            },
          ],
          whenNotMatched: 'discard',
        },
      },
    ])
    .toArray();
}

async function backfillCircleCreationReservations(
  database: MigrationDatabase,
  now: Date,
  assertLockHeld: () => Promise<void>,
): Promise<void> {
  const cutoff = new Date(now.getTime() - RC2_CIRCLE_CREATION_WINDOW_MS);
  for (const status of CIRCLE_STATUSES) {
    await mergeLatestCircleCreationTimes(
      database,
      'circles',
      {
        status,
        deletedAt: null,
        createdByAgentId: { $type: 'string' },
        createdAt: { $gt: cutoff },
      },
      '$createdByAgentId',
      assertLockHeld,
    );
  }
  await mergeLatestCircleCreationTimes(
    database,
    'circles',
    {
      deletedAt: { $gte: cutoff },
      createdByAgentId: { $type: 'string' },
      createdAt: { $gt: cutoff },
    },
    '$createdByAgentId',
    assertLockHeld,
  );
  for (const status of CONTENT_REVIEW_STATUSES) {
    await mergeLatestCircleCreationTimes(
      database,
      'content_review_requests',
      {
        type: 'CIRCLE',
        status,
        requesterAgentId: { $type: 'string' },
        createdAt: { $gt: cutoff },
      },
      '$requesterAgentId',
      assertLockHeld,
    );
  }
}

async function normalizeRc2Fields(context: DatabaseMigrationContext): Promise<void> {
  const posts = context.database.collection('posts');
  const circles = context.database.collection('circles');
  const reviews = context.database.collection('content_review_requests');

  await updateInBatches(
    posts,
    { pinnedAt: { $exists: false } },
    { $set: { pinnedAt: null } },
    context.assertLockHeld,
  );
  await updateInBatches(
    circles,
    { agentPostingEnabled: { $exists: false } },
    { $set: { agentPostingEnabled: true } },
    context.assertLockHeld,
  );
  await updateInBatches(
    circles,
    { postingPolicyVersion: { $exists: false } },
    { $set: { postingPolicyVersion: 1 } },
    context.assertLockHeld,
  );
  await updateInBatches(
    reviews,
    { type: 'POST', 'payload.submissionOrigin': { $exists: false } },
    { $set: { 'payload.submissionOrigin': 'AGENT' } },
    context.assertLockHeld,
  );
  await backfillCircleCreationReservations(context.database, context.now, context.assertLockHeld);
}

async function removeRc1LegacyFields(context: DatabaseMigrationContext): Promise<void> {
  const circles = context.database.collection('circles');
  const reviews = context.database.collection('content_review_requests');
  await updateInBatches(
    circles,
    { creationWeekStartDate: { $exists: true } },
    { $unset: { creationWeekStartDate: '' } },
    context.assertLockHeld,
  );
  await updateInBatches(
    reviews,
    { 'payload.creationWeekStartDate': { $exists: true } },
    { $unset: { 'payload.creationWeekStartDate': '' } },
    context.assertLockHeld,
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function waitForMigrationLockRetry(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MIGRATION_LOCK_RETRY_MS));
}

async function withMigrationLock<T>(
  database: MigrationDatabase,
  work: (lock: MigrationLockHandle) => Promise<T>,
): Promise<T> {
  const locks = database.collection<MigrationLock>(MIGRATION_LOCKS_COLLECTION);
  const owner = randomUUID();
  const deadline = Date.now() + MIGRATION_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const now = new Date();
    try {
      const lock = await locks.findOneAndUpdate(
        {
          _id: MIGRATION_LOCK_ID,
          $or: [
            { leaseExpiresAt: { $lte: now } },
            { leaseExpiresAt: { $exists: false } },
          ],
        },
        { $set: { owner, leaseExpiresAt: new Date(now.getTime() + MIGRATION_LOCK_LEASE_MS) } },
        { upsert: true, returnDocument: 'after' },
      );
      if (lock?.owner === owner) {
        let renewalFailure: Error | null = null;
        let renewal = Promise.resolve();
        const assertHeld = async (): Promise<void> => {
          await renewal;
          if (renewalFailure) throw renewalFailure;
          const heldLock = await locks.findOne({
            _id: MIGRATION_LOCK_ID,
            owner,
            leaseExpiresAt: { $gt: new Date() },
          });
          if (!heldLock) throw new Error('Database migration lock was lost during execution');
        };
        const renewalTimer = setInterval(() => {
          renewal = locks
            .updateOne(
              { _id: MIGRATION_LOCK_ID, owner },
              { $set: { leaseExpiresAt: new Date(Date.now() + MIGRATION_LOCK_LEASE_MS) } },
            )
            .then((result) => {
              if (result.modifiedCount !== 1) {
                renewalFailure = new Error('Database migration lock was lost during execution');
              }
            })
            .catch((error: unknown) => {
              renewalFailure =
                error instanceof Error
                  ? error
                  : new Error('Database migration lock renewal failed');
            });
        }, MIGRATION_LOCK_RENEWAL_MS);
        try {
          await assertHeld();
          const result = await work({ assertHeld });
          await assertHeld();
          return result;
        } finally {
          clearInterval(renewalTimer);
          await locks.deleteOne({ _id: MIGRATION_LOCK_ID, owner });
        }
      }
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
    await waitForMigrationLockRetry();
  }

  throw new Error('Timed out waiting for the database migration lock');
}

export async function runDatabaseMigrations(
  connection: Connection,
  finalizer?: DatabaseMigrationFinalizer,
): Promise<DatabaseMigrationResult[]> {
  const database = requireDatabase(connection);
  return withMigrationLock(database, async (lock) => {
    const records = database.collection<MigrationRecord>(MIGRATIONS_COLLECTION);
    const pendingRecords: DatabaseMigrationResult[] = [];

    for (const migration of DATABASE_MIGRATIONS) {
      const applied = await records.findOne({ _id: migration.id });
      if (applied) {
        if (applied.checksum !== migration.checksum) {
          throw new Error(`Database migration ${migration.id} checksum does not match`);
        }
        continue;
      }

      const appliedAt = new Date();
      await migration.apply({ database, now: appliedAt, assertLockHeld: lock.assertHeld });
      await lock.assertHeld();
      pendingRecords.push({ id: migration.id, appliedAt });
    }

    if (finalizer) {
      await lock.assertHeld();
      await finalizer(connection);
      await lock.assertHeld();
    }

    for (const pendingRecord of pendingRecords) {
      const migration = DATABASE_MIGRATIONS.find(
        (candidate) => candidate.id === pendingRecord.id,
      );
      if (!migration) throw new Error(`Database migration ${pendingRecord.id} is not registered`);
      try {
        await records.insertOne({
          _id: migration.id,
          checksum: migration.checksum,
          appliedAt: pendingRecord.appliedAt,
        });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const existing = await records.findOne({ _id: pendingRecord.id });
        if (!existing || existing.checksum !== migration.checksum) {
          throw new Error(`Database migration ${pendingRecord.id} was recorded inconsistently`);
        }
      }
    }

    return pendingRecords;
  });
}
