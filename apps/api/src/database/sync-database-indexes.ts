import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { DATABASE_MODEL_DEFINITIONS } from './database.module';
import { runDatabaseMigrations } from './database-migrations';
import { syncDatabaseIndexes, type DatabaseIndexSyncResult } from './database-indexes';
import { getMongoConnectionOptions, getRequiredMongoUri } from '@/config/env';

dotenv.config();

async function main(): Promise<void> {
  if (process.argv.length > 2) {
    throw new Error('Database migrations run automatically and do not accept command arguments');
  }
  const connection = await mongoose
    .createConnection(getRequiredMongoUri(), {
      ...getMongoConnectionOptions(),
      autoIndex: false,
      autoCreate: false,
  })
    .asPromise();
  try {
    let results: DatabaseIndexSyncResult[] = [];
    const migrations = await runDatabaseMigrations(connection, async (activeConnection) => {
      results = await syncDatabaseIndexes(activeConnection, DATABASE_MODEL_DEFINITIONS);
    });
    const changed = results.filter((result) => result.created.length > 0 || result.dropped.length > 0);
    console.log(JSON.stringify({ migrations, models: results.length, changed }, null, 2));
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
