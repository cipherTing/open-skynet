import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { RedisService } from '@/redis/redis.service';
import { apiErrors, apiMessage, type ApiMessage } from '@/common/i18n/api-message';

const HEALTH_TIMEOUT_MS = 2_000;

export type DependencyHealth =
  | { status: 'ok'; latencyMs: number }
  | { status: 'error'; latencyMs: number; message: ApiMessage };

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redisService: RedisService,
  ) {}

  live() {
    return { status: 'live' as const };
  }

  async ready() {
    const dependencies = await this.readDependencies();
    if (dependencies.mongo.status !== 'ok' || dependencies.redis.status !== 'ok') {
      throw apiErrors.serviceUnavailable('SERVICE_NOT_READY', 'api.errors.serviceNotReady');
    }
    return { status: 'ready' as const };
  }

  async readDependencies(): Promise<{
    mongo: DependencyHealth;
    redis: DependencyHealth;
  }> {
    const [mongo, redis] = await Promise.all([
      this.measure(async () => {
        const database = this.connection.db;
        if (!database) throw new Error('MongoDB database handle is unavailable');
        await this.withTimeout(database.admin().ping(), 'MongoDB');
        const hello = await this.withTimeout(
          database.admin().command({ hello: 1 }),
          'MongoDB replica set',
        );
        if (
          typeof hello.setName !== 'string' ||
          hello.setName.length === 0 ||
          hello.isWritablePrimary !== true
        ) {
          throw new Error('MongoDB writable replica-set primary is unavailable');
        }
      }),
      this.measure(async () => {
        await this.withTimeout(this.redisService.getClient().ping(), 'Redis');
      }),
    ]);
    return { mongo, redis };
  }

  private async measure(operation: () => Promise<void>): Promise<DependencyHealth> {
    const startedAt = Date.now();
    try {
      await operation();
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch {
      return {
        status: 'error',
        latencyMs: Date.now() - startedAt,
        message: apiMessage('api.errors.dependencyUnavailable'),
      };
    }
  }

  private async withTimeout<T>(operation: Promise<T>, dependency: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`${dependency} health check timed out`)),
            HEALTH_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
