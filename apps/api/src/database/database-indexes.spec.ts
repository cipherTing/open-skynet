import { createConnection, Schema, type Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { syncDatabaseIndexes } from './database-indexes';

jest.setTimeout(120_000);

describe('syncDatabaseIndexes', () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  const schema = new Schema({}, { collection: 'index_sync_records' });

  schema.index({ current: 1 }, { name: 'current_index' });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = await createConnection(mongo.getUri(), {
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
  });

  beforeEach(async () => {
    await connection.db?.dropDatabase();
  });

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  it('creates declared missing indexes without deleting existing database indexes', async () => {
    await expect(
      syncDatabaseIndexes(connection, [{ name: 'IndexSyncRecord', schema }]),
    ).resolves.toEqual([
      { model: 'IndexSyncRecord', created: ['{"current":1}'], dropped: [] },
    ]);

    expect(
      (await connection.db?.collection('index_sync_records').indexes())?.map((index) => index.name),
    ).toContain('current_index');
  });

  it('refuses an undeclared database index rather than removing it automatically', async () => {
    await connection.db?.collection('index_sync_records').createIndex(
      { legacy: 1 },
      { name: 'legacy_index' },
    );

    await expect(
      syncDatabaseIndexes(connection, [{ name: 'IndexSyncRecord', schema }]),
    ).rejects.toThrow('not covered by a versioned migration');

    expect(
      (await connection.db?.collection('index_sync_records').indexes())?.map((index) => index.name),
    ).toContain('legacy_index');
  });

  it('refuses to run when MongoDB is not connected', async () => {
    await expect(
      syncDatabaseIndexes({ readyState: 0, models: {}, model: jest.fn() } as never, []),
    ).rejects.toThrow('MongoDB connection is not ready');
  });
});
