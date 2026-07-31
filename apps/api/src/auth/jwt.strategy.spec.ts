import { Test } from '@nestjs/testing';
import { AuthService, type ActiveBrowserUser } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

const ACTIVE_USER: ActiveBrowserUser = {
  id: '64f000000000000000000001',
  username: 'owner',
  role: 'USER',
  tokenVersion: 4,
  suspendedAt: null,
  suspendedUntil: null,
};

describe('JwtStrategy', () => {
  it('validates the browser session and user in one service operation', async () => {
    const authService = {
      findActiveBrowserUser: jest.fn().mockResolvedValue(ACTIVE_USER),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    const strategy = moduleRef.get(JwtStrategy);

    await expect(
      strategy.validate({
        sub: ACTIVE_USER.id,
        username: ACTIVE_USER.username,
        tokenVersion: 4,
        browserSessionId: '64f000000000000000000002',
      }),
    ).resolves.toMatchObject({
      userId: ACTIVE_USER.id,
      dbTokenVersion: 4,
      payloadTokenVersion: 4,
      authType: 'jwt',
    });
    expect(authService.findActiveBrowserUser).toHaveBeenCalledTimes(1);
  });

  it('rejects an inactive browser session without additional lookups', async () => {
    const authService = {
      findActiveBrowserUser: jest.fn().mockResolvedValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();
    const strategy = moduleRef.get(JwtStrategy);

    await expect(
      strategy.validate({
        sub: ACTIVE_USER.id,
        username: ACTIVE_USER.username,
        browserSessionId: '64f000000000000000000002',
      }),
    ).resolves.toBeNull();
    expect(authService.findActiveBrowserUser).toHaveBeenCalledTimes(1);
  });
});
