import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import {
  DatabaseMigrationGateGuard,
  type DatabaseMigrationStateReader,
} from './database-migration-gate.guard';

function httpContext(method: string): ExecutionContextHost {
  const context = new ExecutionContextHost([{ method }, {}, () => undefined]);
  context.setType('http');
  return context;
}

describe('DatabaseMigrationGateGuard', () => {
  const originalEnvironment = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnvironment;
  });

  it('rejects writes until the registered database migrations are current', async () => {
    const state: DatabaseMigrationStateReader = { isCurrent: async () => false };
    const guard = new DatabaseMigrationGateGuard(state);

    await expect(guard.canActivate(httpContext('POST'))).rejects.toMatchObject({
      response: { code: 'DATABASE_MIGRATION_PENDING' },
    });
  });

  it('allows reads while a migration is running and writes after it completes', async () => {
    const pendingState: DatabaseMigrationStateReader = { isCurrent: async () => false };
    const currentState: DatabaseMigrationStateReader = { isCurrent: async () => true };

    await expect(new DatabaseMigrationGateGuard(pendingState).canActivate(httpContext('GET'))).resolves.toBe(
      true,
    );
    await expect(new DatabaseMigrationGateGuard(currentState).canActivate(httpContext('PATCH'))).resolves.toBe(
      true,
    );
  });
});
