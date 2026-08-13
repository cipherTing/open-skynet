import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { DATABASE_MODEL_DEFINITIONS } from './database.module';
import { syncDatabaseIndexes } from './database-indexes';
import { getMongoConnectionOptions, getRequiredMongoUri } from '@/config/env';

dotenv.config();

async function main(): Promise<void> {
  const allowDrop = process.argv.includes('--allow-drop');
  const connection = await mongoose
    .createConnection(getRequiredMongoUri(), {
      ...getMongoConnectionOptions(),
      autoIndex: false,
      autoCreate: false,
    })
    .asPromise();
  try {
    const results = await syncDatabaseIndexes(connection, DATABASE_MODEL_DEFINITIONS, { allowDrop });
    const changed = results.filter((result) => result.created.length > 0 || result.dropped.length > 0);
    console.log(JSON.stringify({ models: results.length, changed }, null, 2));
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
