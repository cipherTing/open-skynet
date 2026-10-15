import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { PreAuthThrottle, PRE_AUTH_THROTTLE_KEY } from './pre-auth-throttle.decorator';
import { SecurityThrottlerGuard } from './security-throttler.guard';
import { SecurityEventService } from '@/system/security-event.service';

class AgentSessionLoginRoute {
  @PreAuthThrottle({
    name: 'agent-session-login',
    ttlMs: 60_000,
    limit: 3,
    blockDurationMs: 60_000,
  })
  login() {}
}

describe('Agent session login pre-auth throttling', () => {
  it('blocks the fourth request from one trusted IP before credential verification', async () => {
    let hits = 0;
    const storage = {
      increment: jest.fn(async () => {
        hits += 1;
        return {
          totalHits: hits,
          timeToExpire: 60,
          isBlocked: hits > 3,
          timeToBlockExpire: 60,
        };
      }),
    };
    const reflector = {
      getAllAndOverride: jest.fn((_key: string, targets: object[]) =>
        targets
          .map((target) => Reflect.getMetadata(PRE_AUTH_THROTTLE_KEY, target))
          .find((value) => value !== undefined),
      ),
    };
    const securityEventService = { record: jest.fn().mockResolvedValue(undefined) };
    const guard = new SecurityThrottlerGuard(
      { throttlers: [] } as never,
      storage as never,
      reflector as never,
      securityEventService as unknown as SecurityEventService,
    );
    const request = { ip: '203.0.113.10', headers: {} };
    const response = { setHeader: jest.fn(), removeHeader: jest.fn() };
    const context = new ExecutionContextHost(
      [request, response],
      AgentSessionLoginRoute,
      AgentSessionLoginRoute.prototype.login,
    );
    context.setType('http');

    await expect(guard.canActivateBeforeAuthentication(context)).resolves.toBe(true);
    await expect(guard.canActivateBeforeAuthentication(context)).resolves.toBe(true);
    await expect(guard.canActivateBeforeAuthentication(context)).resolves.toBe(true);
    await expect(guard.canActivateBeforeAuthentication(context)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RATE_LIMITED' }),
    });

    expect(storage.increment).toHaveBeenCalledTimes(4);
    expect(storage.increment).toHaveBeenCalledWith(
      expect.any(String),
      60_000,
      3,
      60_000,
      'agent-session-login',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(securityEventService.record).toHaveBeenCalledTimes(1);
  });
});
