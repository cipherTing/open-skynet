import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CircleService } from '@/circle/circle.service';
import { getRequiredJwtSecret } from '@/config/env';
import { Agent } from '@/database/schemas/agent.schema';
import { ForumController } from '@/forum/forum.controller';
import { ForumService } from '@/forum/forum.service';
import { ProgressionService } from '@/progression/progression.service';
import { AnnouncementService } from '@/system/announcement.service';
import { PublicAccessService } from '@/system/public-access.service';
import { SystemController } from '@/system/system.controller';
import { UserController } from '@/user/user.controller';
import { UserService } from '@/user/user.service';
import { WatchService } from '@/watch/watch.service';
import { AgentAuthGuard } from './agent-auth.guard';
import { AgentBrowserSessionService } from './agent-browser-session.service';
import { AgentKeyAuthService } from './agent-key-auth.service';
import { AuthService } from './auth.service';
import { CommunityWriteAccessService } from './community-write-access.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

const AGENT_ID = '64f000000000000000000001';
const OWNER_AGENT_ID = '64f000000000000000000002';
const OWNER_ID = '64f000000000000000000003';
const AGENT_KEY = 'sk_live_panel_access_test';
const PUBLIC_READS = [
  ['/forum/post-panel', { postsToday: { value: 4 } }],
  ['/forum/welcome-summary', { agentsTotal: 3 }],
  ['/forum/active-agents/today', { value: 2 }],
  ['/system/announcements/active', [{ id: 'announcement-1' }]],
  ['/system/public-config', { apiBaseUrl: 'https://example.test/api/v1' }],
] as const;

describe('Agent browser panel HTTP access', () => {
  let app: INestApplication;
  let agentJwt: string;
  let ownerJwt: string;
  const agentModel = {
    findById: jest.fn(async () => ({ id: AGENT_ID })),
    findOne: jest.fn(async () => ({ id: OWNER_AGENT_ID })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ForumController, SystemController, UserController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        AgentAuthGuard,
        {
          provide: AgentKeyAuthService,
          useValue: {
            authenticate: async (key: string) =>
              key === AGENT_KEY
                ? {
                    userId: OWNER_ID,
                    username: 'owner',
                    role: 'USER',
                    authType: 'agent',
                    agentId: AGENT_ID,
                    dbTokenVersion: 0,
                    payloadTokenVersion: 0,
                  }
                : null,
          },
        },
        {
          provide: AgentBrowserSessionService,
          useValue: {
            findActiveAgentBrowserUser: async () => ({
              id: OWNER_ID,
              username: 'owner',
              agentId: AGENT_ID,
              suspendedAt: null,
              suspendedUntil: null,
            }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            findActiveBrowserUser: async () => ({
              id: OWNER_ID,
              username: 'owner',
              role: 'USER',
              tokenVersion: 0,
              suspendedAt: null,
              suspendedUntil: null,
            }),
          },
        },
        {
          provide: ForumService,
          useValue: {
            getPostPanelSummary: async () => ({ postsToday: { value: 4 } }),
            getWelcomeSummary: async () => ({ agentsTotal: 3 }),
            getActiveAgentsToday: async () => ({ value: 2 }),
          },
        },
        { provide: CircleService, useValue: {} },
        { provide: WatchService, useValue: {} },
        { provide: CommunityWriteAccessService, useValue: {} },
        {
          provide: AnnouncementService,
          useValue: { listActive: async () => [{ id: 'announcement-1' }] },
        },
        {
          provide: PublicAccessService,
          useValue: {
            getPublicConfig: async () => ({ apiBaseUrl: 'https://example.test/api/v1' }),
          },
        },
        { provide: UserService, useValue: {} },
        {
          provide: ProgressionService,
          useValue: {
            getCurrentAgentProgression: async (agentId: string) => ({
              level: { xpTotal: agentId === AGENT_ID ? 7 : 19 },
              stamina: { current: 100 },
              dailyTasks: { totalCount: 3 },
            }),
          },
        },
        { provide: getModelToken(Agent.name), useValue: agentModel },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalGuards(new JwtAuthGuard(moduleRef.get(Reflector), moduleRef.get(AgentAuthGuard)));
    await app.init();
    const jwt = new JwtService({ secret: getRequiredJwtSecret() });
    agentJwt = jwt.sign({
      sub: OWNER_ID,
      username: 'owner',
      authType: 'agent',
      agentId: AGENT_ID,
      agentBrowserSessionId: '64f000000000000000000004',
    });
    ownerJwt = jwt.sign({
      sub: OWNER_ID,
      username: 'owner',
      browserSessionId: '64f000000000000000000005',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  for (const credential of ['agent-key', 'agent-session', 'owner-session', 'anonymous'] as const) {
    it.each(PUBLIC_READS)(`${credential} can read %s`, async (path, expected) => {
      const call = request(app.getHttpServer()).get('/api/v1' + path);
      if (credential !== 'anonymous') {
        const token =
          credential === 'agent-key'
            ? AGENT_KEY
            : credential === 'agent-session'
              ? agentJwt
              : ownerJwt;
        call.set('Authorization', 'Bearer ' + token);
      }
      const response = await call.expect(200);
      expect(response.body).toEqual(expected);
    });
  }

  it.each(['agent-key', 'agent-session'] as const)(
    '%s reads its own progression instead of resolving the owner Agent',
    async (credential) => {
      agentModel.findOne.mockClear();
      agentModel.findById.mockClear();
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me/agent/progression')
        .set('Authorization', 'Bearer ' + (credential === 'agent-key' ? AGENT_KEY : agentJwt))
        .expect(200);
      expect(response.body).toMatchObject({
        level: { xpTotal: 7 },
        stamina: { current: 100 },
        dailyTasks: { totalCount: 3 },
      });
      expect(agentModel.findById).toHaveBeenCalledWith(AGENT_ID);
      expect(agentModel.findOne).not.toHaveBeenCalled();
    },
  );

  it('keeps owner progression access and rejects anonymous personal state access', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me/agent/progression')
      .set('Authorization', 'Bearer ' + ownerJwt)
      .expect(200);
    expect(response.body.level.xpTotal).toBe(19);
    await request(app.getHttpServer()).get('/api/v1/users/me/agent/progression').expect(401);
  });

  it.each(['agent-key', 'agent-session'] as const)(
    '%s remains blocked from owner credentials and unregistered browser routes',
    async (credential) => {
      const authorization = 'Bearer ' + (credential === 'agent-key' ? AGENT_KEY : agentJwt);
      for (const path of [
        '/users/me/agent/key-info',
        '/users/me/agent/guide-link',
        '/forum/posts/similar',
      ]) {
        await request(app.getHttpServer())
          .get('/api/v1' + path)
          .set('Authorization', authorization)
          .expect(403);
      }
      for (const path of ['/users/me/agent/regenerate-key', '/users/me/agent/guide-link']) {
        await request(app.getHttpServer())
          .post('/api/v1' + path)
          .set('Authorization', authorization)
          .expect(403);
      }
    },
  );
});
