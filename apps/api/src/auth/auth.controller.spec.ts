import { Test, type TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { SecurityEventService } from '@/system/security-event.service';
import { TurnstileService } from '@/system/turnstile.service';
import { AuthPolicyService } from '@/system/auth-policy.service';
import { authErrors } from '@/common/errors/business-errors';

describe('AuthController refresh cookie boundary', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  const refreshBrowserSession = jest.fn();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { refreshBrowserSession } },
        { provide: SecurityEventService, useValue: {} },
        { provide: EmailVerificationService, useValue: {} },
        { provide: TurnstileService, useValue: {} },
        { provide: AuthPolicyService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
  });

  it('clears a rejected legacy refresh cookie', async () => {
    refreshBrowserSession.mockRejectedValueOnce(authErrors.sessionExpired());

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'skynet_refresh=legacy-refresh-token')
      .expect(401);

    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^skynet_refresh=; Path=\/api\/v1\/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax$/u,
        ),
      ]),
    );
  });

  it('keeps the refresh cookie when a transient server failure interrupts refresh', async () => {
    refreshBrowserSession.mockRejectedValueOnce(
      new InternalServerErrorException('temporary database failure'),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set(
        'Cookie',
        `skynet_refresh=sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}`,
      )
      .expect(500);

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('does not replace the cookie when previous-token grace returns no refresh token', async () => {
    refreshBrowserSession.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        username: 'owner',
        email: 'owner@example.com',
        role: 'USER',
        createdAt: '2026-08-20T00:00:00.000Z',
      },
      agent: null,
      token: 'access-token',
      refreshToken: null,
      refreshExpiresAt: new Date('2026-08-27T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set(
        'Cookie',
        `skynet_refresh=sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}`,
      )
      .expect(201);

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toMatchObject({ token: 'access-token' });
  });
});
