import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { isProduction } from '@/config/env';
import { apiErrors } from '@/common/i18n/api-message';
import { DatabaseMigrationStateService } from '@/database/database-migration-state.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface DatabaseMigrationStateReader {
  isCurrent: () => Promise<boolean>;
}

@Injectable()
export class DatabaseMigrationGateGuard implements CanActivate {
  constructor(
    @Inject(DatabaseMigrationStateService)
    private readonly migrationState: DatabaseMigrationStateReader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!isProduction() || !WRITE_METHODS.has(request.method)) return true;
    if (await this.migrationState.isCurrent()) return true;
    throw apiErrors.serviceUnavailable(
      'DATABASE_MIGRATION_PENDING',
      'api.errors.databaseMigrationPending',
    );
  }
}
