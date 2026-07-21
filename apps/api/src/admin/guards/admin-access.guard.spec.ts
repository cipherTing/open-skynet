import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import type { AdminPrincipal } from '@/admin/interfaces/admin-principal.interface';
import { SecurityEventService } from '@/system/security-event.service';
import { AdminAccessGuard } from './admin-access.guard';

type GuardRequest = Request & { user?: JwtAuthUser; admin?: AdminPrincipal };

function browserUser(role: 'USER' | 'ADMIN', browserSessionId = 'browser-session'): JwtAuthUser {
  return {
    userId: 'user-id',
    username: 'operator',
    dbTokenVersion: 1,
    payloadTokenVersion: 1,
    browserSessionId,
    role,
    authType: 'jwt',
  };
}

function contextFor(user?: JwtAuthUser): { context: ExecutionContext; request: GuardRequest } {
  const request = Object.assign({} as Request, { user });
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  return { context, request };
}

describe('AdminAccessGuard', () => {
  let moduleRef: TestingModule;
  let guard: AdminAccessGuard;
  const record = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [AdminAccessGuard, { provide: SecurityEventService, useValue: { record } }],
    }).compile();
    guard = moduleRef.get(AdminAccessGuard);
  });

  beforeEach(() => record.mockClear());
  afterAll(() => moduleRef.close());

  it('requires an authenticated browser user', async () => {
    const { context } = contextFor();
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-administrator browser user', async () => {
    const { context } = contextFor(browserUser('USER'));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an Agent Key even when its owner is an administrator', async () => {
    const agentUser: JwtAuthUser = {
      ...browserUser('ADMIN'),
      authType: 'agent',
      agentId: 'agent-id',
    };
    const { context } = contextFor(agentUser);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'AGENT_CREDENTIAL_ON_ADMIN_ROUTE' }),
    );
  });

  it('requires the authenticated administrator to have a browser session', async () => {
    const user = browserUser('ADMIN');
    delete user.browserSessionId;
    const { context } = contextFor(user);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('exposes the authenticated administrator principal to controllers', async () => {
    const { context, request } = contextFor(browserUser('ADMIN'));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.admin).toEqual({
      userId: 'user-id',
      username: 'operator',
      browserSessionId: 'browser-session',
    });
  });
});
