import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection, type ClientSession } from "mongoose";
import { isProduction } from "@/config/env";

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
  private fallbackTransactionQueue: Promise<void> = Promise.resolve();

  constructor(@InjectConnection() public readonly connection: Connection) {}

  private async runWithoutReplicaSet<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const previous = this.fallbackTransactionQueue;
    let releaseQueue: () => void = () => {};
    this.fallbackTransactionQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previous;
    try {
      return await fn(undefined);
    } finally {
      releaseQueue();
    }
  }

  /**
   * 兼容性事务方法。
   * 如果 MongoDB 配置为副本集，使用 session 执行事务。
   * 否则，串行执行操作（开发环境降级）。
   */
  async $transaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (this.connection.readyState !== 1) {
      throw new Error("MongoDB connection is not ready");
    }
    const database = this.connection.db;
    if (!database) {
      throw new Error("MongoDB database handle is not ready");
    }

    let isReplicaSet = false;
    try {
      const status = await database.admin().command({ hello: 1 });
      isReplicaSet =
        isReplicaSetStatus(status) && typeof status.setName === "string";
    } catch (error) {
      throw new Error("Failed to inspect MongoDB transaction support", {
        cause: error,
      });
    }

    if (isReplicaSet) {
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
    }

    if (isProduction()) {
      throw new Error(
        "MongoDB replica set is required for production transactions",
      );
    }

    // Fallback: serial execution without transaction in development.
    return this.runWithoutReplicaSet(fn);
  }
}
