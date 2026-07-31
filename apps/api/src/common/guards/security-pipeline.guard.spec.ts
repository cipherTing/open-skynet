import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SecurityPipelineGuard } from './security-pipeline.guard';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { SecurityThrottlerGuard } from './security-throttler.guard';

describe('SecurityPipelineGuard', () => {
  const context = {} as ExecutionContext;

  it('runs pre-auth throttling, authentication, then account-aware throttling exactly once', async () => {
    const calls: string[] = [];
    const jwtAuthGuard = {
      canActivate: jest.fn(async () => {
        calls.push('authenticate');
        return true;
      }),
    };
    const securityThrottlerGuard = {
      canActivateBeforeAuthentication: jest.fn(async () => {
        calls.push('pre-auth');
        return true;
      }),
      canActivateAfterAuthentication: jest.fn(async () => {
        calls.push('post-auth');
        return true;
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SecurityPipelineGuard,
        { provide: JwtAuthGuard, useValue: jwtAuthGuard },
        { provide: SecurityThrottlerGuard, useValue: securityThrottlerGuard },
      ],
    }).compile();
    const guard = moduleRef.get(SecurityPipelineGuard);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(calls).toEqual(['pre-auth', 'authenticate', 'post-auth']);
    expect(securityThrottlerGuard.canActivateBeforeAuthentication).toHaveBeenCalledTimes(1);
    expect(jwtAuthGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(securityThrottlerGuard.canActivateAfterAuthentication).toHaveBeenCalledTimes(1);
  });

  it('does not consume the post-auth quota when authentication rejects the request', async () => {
    const jwtAuthGuard = {
      canActivate: jest.fn().mockResolvedValue(false),
    };
    const securityThrottlerGuard = {
      canActivateBeforeAuthentication: jest.fn().mockResolvedValue(true),
      canActivateAfterAuthentication: jest.fn().mockResolvedValue(true),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SecurityPipelineGuard,
        { provide: JwtAuthGuard, useValue: jwtAuthGuard },
        { provide: SecurityThrottlerGuard, useValue: securityThrottlerGuard },
      ],
    }).compile();
    const guard = moduleRef.get(SecurityPipelineGuard);

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(securityThrottlerGuard.canActivateAfterAuthentication).not.toHaveBeenCalled();
  });
});
