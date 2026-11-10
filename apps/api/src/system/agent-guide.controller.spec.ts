import { RequestMethod, type INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AgentAuthGuard } from '@/auth/agent-auth.guard';
import { AgentBrowserSessionService } from '@/auth/agent-browser-session.service';
import { AgentKeyAuthService } from '@/auth/agent-key-auth.service';
import { AuthService } from '@/auth/auth.service';
import { hashOpaqueToken } from '@/auth/auth-security';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { JwtStrategy } from '@/auth/jwt.strategy';
import { encryptSecret } from '@/common/security/encrypted-secret';
import { Agent } from '@/database/schemas/agent.schema';
import { PublicAccessConfig } from '@/database/schemas/public-access-config.schema';
import { RedisService } from '@/redis/redis.service';
import { AnnouncementService } from './announcement.service';
import { AgentGuideController } from './agent-guide.controller';
import type { AgentGuideBootstrapRecord } from './agent-guide-bootstrap';
import { PublicAccessService } from './public-access.service';
import { getReleaseContract } from './release-contract';
import { SystemController } from './system.controller';

const AGENT_ID = 'guide-agent';
const AGENT_KEY = 'sk_live_guide_http_test';
const BOOTSTRAP_TOKEN = AGENT_ID + '.guide-http-bootstrap';

describe('Agent Guide single HTTP entry', () => {
  let app: INestApplication;
  let bootstrapRecord: AgentGuideBootstrapRecord | null;
  let keyVersion: number;
  const configModel = { findOne: jest.fn(async () => null) };
  const agentModel = {
    findById: jest.fn(() => ({
      select: async () => ({
        id: AGENT_ID,
        secretKeyVersion: keyVersion,
        secretKeyCiphertext: encryptSecret(AGENT_KEY, 'agent-key', AGENT_ID),
      }),
    })),
  };
  const redis = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => 'OK'),
    eval: jest.fn(async (_script: string, _keyCount: number, _key: string, hash: string) =>
      bootstrapRecord?.tokenHash === hash ? JSON.stringify(bootstrapRecord) : null,
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SystemController, AgentGuideController],
      providers: [
        PublicAccessService,
        JwtAuthGuard,
        JwtStrategy,
        AgentAuthGuard,
        { provide: getModelToken(PublicAccessConfig.name), useValue: configModel },
        { provide: getModelToken(Agent.name), useValue: agentModel },
        { provide: RedisService, useValue: { getClient: () => redis } },
        { provide: AnnouncementService, useValue: {} },
        {
          provide: AgentKeyAuthService,
          useValue: {
            authenticate: async (key: string) =>
              key === AGENT_KEY
                ? {
                    userId: 'guide-owner',
                    username: 'guide-owner',
                    role: 'USER',
                    authType: 'agent',
                    agentId: AGENT_ID,
                    dbTokenVersion: 0,
                    payloadTokenVersion: 0,
                  }
                : null,
          },
        },
        { provide: AuthService, useValue: { findActiveBrowserUser: async () => null } },
        {
          provide: AgentBrowserSessionService,
          useValue: { findActiveAgentBrowserUser: async () => null },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'guide.md', method: RequestMethod.GET }],
    });
    app.useGlobalGuards(moduleRef.get(JwtAuthGuard));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    keyVersion = 1;
    bootstrapRecord = {
      tokenHash: hashOpaqueToken(BOOTSTRAP_TOKEN),
      tokenCiphertext: 'not-read-by-guide-request',
      expiresAt: '2099-01-01T00:00:00.000Z',
      keyVersion: 1,
      publicAccessVersion: 0,
      revisitIntervalHours: 12,
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('reads the current Guide at /guide.md with real Agent authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/guide.md')
      .set('Authorization', 'Bearer ' + AGENT_KEY)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/^text\/markdown/u);
    expect(response.headers['x-skynet-agent-guide-revision']).toBe(
      getReleaseContract().agentGuideRevision,
    );
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.text).toContain('install-skynet-skill.py');
    expect(response.text).not.toContain(AGENT_KEY);
  });

  it('requires a valid Agent Key or bootstrap instead of accepting anonymous or invalid credentials', async () => {
    await request(app.getHttpServer()).get('/guide.md').expect(401);
    await request(app.getHttpServer())
      .get('/guide.md')
      .set('Authorization', 'Bearer sk_live_invalid')
      .expect(401);
    await request(app.getHttpServer())
      .get('/guide.md')
      .set('Authorization', 'Bearer invalid-jwt')
      .expect(401);
  });

  it('revalidates authenticated Guide requests with the matching ETag', async () => {
    const first = await request(app.getHttpServer())
      .get('/guide.md')
      .set('Authorization', 'Bearer ' + AGENT_KEY)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/guide.md')
      .set('Authorization', 'Bearer ' + AGENT_KEY)
      .set('If-None-Match', first.headers.etag)
      .expect(304);

    expect(second.text).toBe('');
    expect(second.headers.etag).toBe(first.headers.etag);
    expect(second.headers['cache-control']).toBe('private, max-age=60, must-revalidate');
    expect(second.headers['x-skynet-agent-guide-revision']).toBe(
      getReleaseContract().agentGuideRevision,
    );
  });

  it('delivers credentials through the existing temporary bootstrap at the same entry without caching', async () => {
    const first = await request(app.getHttpServer())
      .get('/guide.md')
      .query({ bootstrap: BOOTSTRAP_TOKEN })
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/guide.md')
      .query({ bootstrap: BOOTSTRAP_TOKEN })
      .set('If-None-Match', first.headers.etag)
      .expect(200);

    expect(first.text).toContain('SKYNET_API_KEY=' + AGENT_KEY);
    expect(second.text).toBe(first.text);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(second.headers['referrer-policy']).toBe('no-referrer');
  });

  it('rejects an expired bootstrap before reading credentials', async () => {
    if (!bootstrapRecord) throw new Error('Missing test bootstrap');
    bootstrapRecord.expiresAt = '2020-01-01T00:00:00.000Z';
    await request(app.getHttpServer())
      .get('/guide.md')
      .query({ bootstrap: BOOTSTRAP_TOKEN })
      .expect(410);

    expect(agentModel.findById).not.toHaveBeenCalled();
  });

  it('rejects a bootstrap revoked by Agent Key rotation', async () => {
    keyVersion = 2;
    const response = await request(app.getHttpServer())
      .get('/guide.md')
      .query({ bootstrap: BOOTSTRAP_TOKEN })
      .expect(410);

    expect(response.text).not.toContain(AGENT_KEY);
  });

  it('rejects an unknown bootstrap token without disclosing credentials', async () => {
    bootstrapRecord = null;
    const response = await request(app.getHttpServer())
      .get('/guide.md')
      .query({ bootstrap: AGENT_ID + '.unknown-bootstrap' })
      .expect(410);

    expect(response.text).not.toContain(AGENT_KEY);
    expect(agentModel.findById).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/system/agent-guide',
    '/api/v1/guide.md',
    '/system/agent-guide',
    '/api/v1/system/governance-guide',
  ])('does not retain the removed or prefixed Guide alias %s', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer ' + AGENT_KEY)
      .expect(404);
  });

  it('keeps ordinary system APIs under /api/v1', async () => {
    await request(app.getHttpServer()).get('/api/v1/system/public-config').expect(200);
    await request(app.getHttpServer()).get('/system/public-config').expect(404);
  });
});
