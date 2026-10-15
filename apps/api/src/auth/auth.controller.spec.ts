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
import { AgentBrowserSessionService } from './agent-browser-session.service';

describe('AuthController refresh cookie boundary', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  const refreshBrowserSession = jest.fn();
  const login = jest.fn();
  const loginWithAgentKey = jest.fn();
  const refreshAgentBrowserSession = jest.fn();
  const logoutAgentBrowserSession = jest.fn();
  const revokeAgentSessionFromRefreshToken = jest.fn();
  const logoutBrowserSessionFromRefreshToken = jest.fn();
  const sendEmailVerification = jest.fn();
  const verifyIfEnabled = jest.fn();

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { login, refreshBrowserSession, logoutBrowserSessionFromRefreshToken },
        },
        {
          provide: AgentBrowserSessionService,
          useValue: {
            loginWithAgentKey,
            refreshAgentBrowserSession,
            logoutAgentBrowserSession,
            revokeAgentSessionFromRefreshToken,
          },
        },
        { provide: SecurityEventService, useValue: {} },
        { provide: EmailVerificationService, useValue: { send: sendEmailVerification } },
        { provide: TurnstileService, useValue: { verifyIfEnabled } },
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

  it('uses the shared authentication Turnstile action for login', async () => {
    verifyIfEnabled.mockResolvedValueOnce(2);
    login.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        username: 'owner',
        email: 'owner@example.com',
        role: 'USER',
        createdAt: '2026-09-06T00:00:00.000Z',
      },
      agent: null,
      token: 'access-token',
      refreshToken: null,
      refreshExpiresAt: new Date('2026-09-13T00:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        identity: 'owner@example.com',
        password: 'Password123',
        turnstileToken: 'turnstile-token',
      })
      .expect(201);

    expect(verifyIfEnabled).toHaveBeenCalledWith(
      'turnstile-token',
      'authentication',
      expect.any(String),
    );
  });

  it('exchanges an Agent Key for an Agent-only session and HttpOnly refresh cookie', async () => {
    loginWithAgentKey.mockResolvedValueOnce({
      sessionType: 'AGENT',
      user: null,
      agent: { id: 'agent-1', name: 'Story Agent' },
      token: 'agent-access-token',
      refreshToken: `sk_agt_rt_v1.${'A'.repeat(32)}.${'B'.repeat(43)}`,
      refreshExpiresAt: new Date('2026-10-21T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/auth/agent-session')
      .send({ key: 'sk_live_valid_key' })
      .expect(201);

    expect(response.body).toMatchObject({
      sessionType: 'AGENT',
      user: null,
      agent: { id: 'agent-1', name: 'Story Agent' },
      token: 'agent-access-token',
    });
    expect(loginWithAgentKey).toHaveBeenCalledWith('sk_live_valid_key');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^skynet_agent_refresh=sk_agt_rt_v1\.[A-Z]{32}\.[A-Z]{43}; Path=\/api\/v1\/auth; Expires=.*; HttpOnly; SameSite=Lax$/u,
        ),
      ]),
    );
  });

  it('revokes prior browser identities when a user switches to an Agent session', async () => {
    loginWithAgentKey.mockResolvedValueOnce({
      sessionType: 'AGENT',
      user: null,
      agent: { id: 'agent-1', name: 'Story Agent' },
      token: 'agent-access-token',
      refreshToken: `sk_agt_rt_v1.${'E'.repeat(32)}.${'F'.repeat(43)}`,
      refreshExpiresAt: new Date('2026-10-21T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/auth/agent-session')
      .set(
        'Cookie',
        `skynet_refresh=sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}; skynet_agent_refresh=sk_agt_rt_v1.${'C'.repeat(32)}.${'D'.repeat(43)}`,
      )
      .send({ key: 'sk_live_valid_key' })
      .expect(201);

    expect(logoutBrowserSessionFromRefreshToken).toHaveBeenCalledWith(
      `sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}`,
    );
    expect(revokeAgentSessionFromRefreshToken).toHaveBeenCalledWith(
      `sk_agt_rt_v1.${'C'.repeat(32)}.${'D'.repeat(43)}`,
    );
    expect(response.body.sessionType).toBe('AGENT');
  });

  it('discovers an Agent session from its dedicated cookie through the shared refresh endpoint', async () => {
    refreshAgentBrowserSession.mockResolvedValueOnce({
      sessionType: 'AGENT',
      user: null,
      agent: { id: 'agent-1', name: 'Story Agent' },
      token: 'next-agent-access-token',
      refreshToken: `sk_agt_rt_v1.${'C'.repeat(32)}.${'D'.repeat(43)}`,
      refreshExpiresAt: new Date('2026-10-21T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/auth/session/refresh')
      .set('Cookie', `skynet_agent_refresh=sk_agt_rt_v1.${'A'.repeat(32)}.${'B'.repeat(43)}`)
      .expect(201);

    expect(refreshAgentBrowserSession).toHaveBeenCalledWith(
      `sk_agt_rt_v1.${'A'.repeat(32)}.${'B'.repeat(43)}`,
    );
    expect(response.body).toMatchObject({
      sessionType: 'AGENT',
      user: null,
      agent: { id: 'agent-1' },
      token: 'next-agent-access-token',
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^skynet_agent_refresh=sk_agt_rt_v1\.[C]{32}\.[D]{43}; Path=\/api\/v1\/auth; Expires=.*; HttpOnly; SameSite=Lax$/u,
        ),
      ]),
    );
  });

  it('discovers a user session from the existing user refresh cookie through the shared endpoint', async () => {
    refreshBrowserSession.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        username: 'owner',
        email: 'owner@example.com',
        role: 'USER',
        createdAt: '2026-10-14T00:00:00.000Z',
      },
      agent: null,
      token: 'user-access-token',
      refreshToken: `sk_rt_v2.${'C'.repeat(32)}.${'D'.repeat(43)}`,
      refreshExpiresAt: new Date('2026-10-21T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/auth/session/refresh')
      .set('Cookie', `skynet_refresh=sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}`)
      .expect(201);

    expect(refreshBrowserSession).toHaveBeenCalledWith(
      `sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}`,
    );
    expect(response.body).toMatchObject({
      sessionType: 'USER',
      user: { id: 'user-1' },
      token: 'user-access-token',
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^skynet_refresh=sk_rt_v2\.[C]{32}\.[D]{43}; Path=\/api\/v1\/auth; Expires=.*; HttpOnly; SameSite=Lax$/u,
        ),
      ]),
    );
  });

  it('rejects and clears both refresh cookies rather than guessing between session types', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/session/refresh')
      .set(
        'Cookie',
        `skynet_refresh=sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}; skynet_agent_refresh=sk_agt_rt_v1.${'C'.repeat(32)}.${'D'.repeat(43)}`,
      )
      .expect(401);

    expect(refreshBrowserSession).not.toHaveBeenCalled();
    expect(refreshAgentBrowserSession).not.toHaveBeenCalled();
    expect(logoutBrowserSessionFromRefreshToken).toHaveBeenCalledWith(
      `sk_rt_v2.${'A'.repeat(32)}.${'B'.repeat(43)}`,
    );
    expect(revokeAgentSessionFromRefreshToken).toHaveBeenCalledWith(
      `sk_agt_rt_v1.${'C'.repeat(32)}.${'D'.repeat(43)}`,
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^skynet_refresh=; Path=\/api\/v1\/auth; Expires=/u),
        expect.stringMatching(/^skynet_agent_refresh=; Path=\/api\/v1\/auth; Expires=/u),
      ]),
    );
  });

  it('revokes the Agent session and clears only its refresh cookie on logout', async () => {
    logoutAgentBrowserSession.mockResolvedValueOnce(undefined);

    const response = await request(app.getHttpServer())
      .post('/auth/agent-session/logout')
      .set('Cookie', `skynet_agent_refresh=sk_agt_rt_v1.${'A'.repeat(32)}.${'B'.repeat(43)}`)
      .expect(201);

    expect(logoutAgentBrowserSession).toHaveBeenCalledWith(
      `sk_agt_rt_v1.${'A'.repeat(32)}.${'B'.repeat(43)}`,
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^skynet_agent_refresh=; Path=\/api\/v1\/auth; Expires=/u,
        ),
      ]),
    );
  });

  it.each(['REGISTER', 'RESET_PASSWORD'] as const)(
    'forwards the shared Turnstile token for %s email verification',
    async (purpose) => {
      sendEmailVerification.mockResolvedValueOnce({
        challengeId: '507f1f77bcf86cd799439011',
        expiresAt: '2026-09-06T00:10:00.000Z',
      });

      await request(app.getHttpServer())
        .post('/auth/email-verifications')
        .send({
          email: 'agent@example.com',
          purpose,
          turnstileToken: 'turnstile-token',
        })
        .expect(201);

      expect(sendEmailVerification).toHaveBeenCalledWith(
        'agent@example.com',
        purpose,
        'turnstile-token',
        expect.any(String),
      );
    },
  );
});
