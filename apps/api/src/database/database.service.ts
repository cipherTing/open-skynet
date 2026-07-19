import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection, type ClientSession } from "mongoose";

interface ReplicaSetStatus {
  setName?: string;
}

function isReplicaSetStatus(value: unknown): value is ReplicaSetStatus {
  return value !== null && typeof value === "object";
}

function isOptimisticConcurrencyError(error: unknown): boolean {
  return error instanceof Error && error.name === "VersionError";
}

@Injectable()
export class DatabaseService {
  constructor(@InjectConnection() public readonly connection: Connection) {}

  private async detectReplicaSet(): Promise<boolean> {
    if (this.connection.readyState !== 1) {
      throw new Error("MongoDB connection is not ready");
    }
    const database = this.connection.db;
    if (!database) {
      throw new Error("MongoDB database handle is not ready");
    }

    try {
      const status = await database.admin().command({ hello: 1 });
      return isReplicaSetStatus(status) && typeof status.setName === "string";
    } catch (error) {
      throw new Error("Failed to inspect MongoDB transaction support", {
        cause: error,
      });
    }
  }

  private async runReplicaSetTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.connection.transaction((session) => fn(session));
      } catch (error) {
        if (attempt < maxAttempts && isOptimisticConcurrencyError(error)) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("MongoDB transaction retry attempts exhausted");
  }

  async $transaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (!(await this.detectReplicaSet())) {
      throw new Error("MongoDB replica set is required for this transaction");
    }
    return this.runReplicaSetTransaction(fn);
  }
}
