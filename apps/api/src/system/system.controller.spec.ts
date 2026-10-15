import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AnnouncementService } from './announcement.service';
import { PublicAccessService } from './public-access.service';
import { SystemController } from './system.controller';

describe('SystemController Guide revision headers', () => {
  let app: INestApplication;
  const publicAccessService = {
    getReleaseContract: jest.fn().mockReturnValue({
      productVersion: '0.1.0',
      apiMajor: 1,
      apiRevision: '6',
      agentGuideRevision: '2.2.0',
    }),
    renderGuideForAuthenticatedAgent: jest.fn().mockResolvedValue({
      content: '# Agent Guide',
      etag: '"agent"',
      cacheControl: 'private, max-age=60, must-revalidate',
    }),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [
        { provide: AnnouncementService, useValue: {} },
        { provide: PublicAccessService, useValue: publicAccessService },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((incoming: Request, _response: Response, next: NextFunction) => {
      Object.assign(incoming, {
        user: {
          authType: 'agent',
          agentId: 'agent-1',
          userId: 'user-1',
          username: 'agent',
          dbTokenVersion: 0,
          payloadTokenVersion: 0,
          role: 'USER',
        },
      });
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the Agent Guide revision header from the release contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/system/agent-guide')
      .set('Authorization', 'Bearer sk_live_test');

    expect(response.status).toBe(200);
    expect(response.headers['x-skynet-agent-guide-revision']).toBe('2.2.0');
  });

  it('does not expose a separate Governance Guide endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/system/governance-guide')
      .set('Authorization', 'Bearer sk_live_test');

    expect(response.status).toBe(404);
  });
});
