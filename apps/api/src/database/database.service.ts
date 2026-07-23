import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, type ClientSession } from 'mongoose';

const TRANSACTION_RETRY_ATTEMPTS = 3;

interface ReplicaSetStatus {
  setName?: string;
}

function isReplicaSetStatus(value: unknown): value is ReplicaSetStatus {
  return value !== null && typeof value === 'object';
}

function isOptimisticConcurrencyError(error: unknown): boolean {
  return error instanceof Error && error.name === 'VersionError';
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private transactionSupportCheck: Promise<void> | null = null;

  constructor(@InjectConnection() public readonly connection: Connection) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTransactionSupport();
  }

  private ensureTransactionSupport(): Promise<void> {
    this.transactionSupportCheck ??= this.verifyTransactionSupport();
    return this.transactionSupportCheck;
  }

  private async verifyTransactionSupport(): Promise<void> {
    if (this.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not ready');
    }
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB database handle is not ready');
    }

    let status: unknown;
    try {
      status = await database.admin().command({ hello: 1 });
    } catch (error) {
      throw new Error('Failed to inspect MongoDB transaction support', {
        cause: error,
      });
    }
    if (!isReplicaSetStatus(status) || typeof status.setName !== 'string') {
      throw new Error('MongoDB replica set is required for transactions');
    }
  }

  private async runReplicaSetTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= TRANSACTION_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await this.connection.transaction((session) => fn(session));
      } catch (error) {
        if (attempt < TRANSACTION_RETRY_ATTEMPTS && isOptimisticConcurrencyError(error)) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('MongoDB transaction retry attempts exhausted');
  }

  async $transaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    await this.ensureTransactionSupport();
    return this.runReplicaSetTransaction(fn);
  }
}
