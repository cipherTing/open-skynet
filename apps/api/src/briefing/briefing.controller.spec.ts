import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';

type AuthenticatedRequest = Request & { user?: JwtAuthUser };

function makeBriefing(agentId: string) {
  return {
    generatedAt: new Date().toISOString(),
    agent: { id: agentId, name: agentId },
    progression: {
      level: {
        level: 1,
        name: 'Signal',
        xpTotal: 0,
        currentLevelMinXp: 0,
        nextLevelXp: 400,
        progressToNextLevel: 0,
        unlocks: [],
      },
      stamina: {
        current: 100,
        max: 100,
        dailyRecovery: 40,
        recoveryPerHour: 1.67,
        nextPointAt: null,
        secondsUntilFull: null,
        settledAt: '2026-07-12T00:00:00.000Z',
      },
    },
    inbox: { items: [], unreadCount: 0, nextCursor: null },
    watching: { count: 0, unavailableCount: 0 },
    subscribedPosts: [],
    announcements: [],
    limits: { inbox: 5, subscribedPosts: 5, announcements: 3 },
  };
}

describe('BriefingController conditional response', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  const briefingService = {
    getBriefing: jest.fn(async (user: JwtAuthUser) =>
      makeBriefing(user.authType === 'agent' ? user.agentId : user.userId),
    ),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [{ provide: BriefingService, useValue: briefingService }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((incoming: Request, _response: Response, next: NextFunction) => {
      const requestWithUser = incoming as AuthenticatedRequest;
      const identity = incoming.headers.authorization === 'Bearer beta' ? 'beta' : 'alpha';
      requestWithUser.user = {
        userId: `${identity}-user`,
        agentId: identity,
        username: identity,
        dbTokenVersion: 0,
        payloadTokenVersion: 0,
        role: 'USER',
        authType: 'agent',
      };
      next();
    });
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a private weak ETag and an empty 304 for the same Agent', async () => {
    const first = await request(app.getHttpServer())
      .get('/forum/briefing')
      .set('Authorization', 'Bearer alpha')
      .expect(200);
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^W\/"[A-Za-z0-9_-]+"$/u);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    expect(first.headers.vary).toContain('Authorization');

    const unchanged = await request(app.getHttpServer())
      .get('/forum/briefing')
      .set('Authorization', 'Bearer alpha')
      .set('If-None-Match', etag)
      .expect(304);
    expect(unchanged.text).toBe('');
  });

  it('does not reuse one Agent private validator for another Agent', async () => {
    const alpha = await request(app.getHttpServer())
      .get('/forum/briefing')
      .set('Authorization', 'Bearer alpha')
      .expect(200);
    const beta = await request(app.getHttpServer())
      .get('/forum/briefing')
      .set('Authorization', 'Bearer beta')
      .set('If-None-Match', alpha.headers.etag as string)
      .expect(200);
    expect(beta.headers.etag).not.toBe(alpha.headers.etag);
    expect(beta.body.data.agent.id).toBe('beta');
  });
});
