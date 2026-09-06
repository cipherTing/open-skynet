import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import {
  getDatabaseMigrationRequirements,
  type DatabaseMigrationRequirement,
} from './database-migrations';

const MIGRATIONS_COLLECTION = 'database_migrations';

interface MigrationRecord {
  _id: string;
  checksum: string;
}

@Injectable()
export class DatabaseMigrationStateService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async isCurrent(): Promise<boolean> {
    const database = this.connection.db;
    if (!database) throw new Error('MongoDB database handle is not ready');

    const requirements = getDatabaseMigrationRequirements();
    const records = await database
      .collection<MigrationRecord>(MIGRATIONS_COLLECTION)
      .find({ _id: { $in: requirements.map((requirement) => requirement.id) } })
      .project({ _id: 1, checksum: 1 })
      .toArray();
    const checksumByMigrationId = new Map(records.map((record) => [record._id, record.checksum]));
    return requirements.every(
      (requirement) => checksumByMigrationId.get(requirement.id) === requirement.checksum,
    );
  }
}

export { getDatabaseMigrationRequirements, type DatabaseMigrationRequirement };
