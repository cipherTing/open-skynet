import { createConnection, type Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  DatabaseMigrationStateService,
  getDatabaseMigrationRequirements,
} from './database-migration-state.service';

jest.setTimeout(120_000);

describe('DatabaseMigrationStateService', () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = await createConnection(mongo.getUri()).asPromise();
  });

  beforeEach(async () => {
    await connection.db?.dropDatabase();
  });

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  it('remains pending until every registered migration has its matching checksum', async () => {
    const database = connection.db;
    if (!database) throw new Error('Test database is unavailable');
    const service = new DatabaseMigrationStateService(connection);
    const requirements = getDatabaseMigrationRequirements();

    await expect(service.isCurrent()).resolves.toBe(false);
    await database
      .collection<{ _id: string; checksum: string; appliedAt: Date }>('database_migrations')
      .insertMany(
      requirements.map((requirement) => ({
        _id: requirement.id,
        checksum: requirement.checksum,
        appliedAt: new Date(),
      })),
    );

    await expect(service.isCurrent()).resolves.toBe(true);
  });
});
