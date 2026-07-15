import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DatabaseService } from '@/database/database.service';
import {
  AdminAuditLog,
  AdminAuditLogSchema,
} from '@/database/schemas/admin-audit-log.schema';
import {
  Announcement,
  AnnouncementSchema,
} from '@/database/schemas/announcement.schema';
import {
  FEATURE_FLAG_KEYS,
  FeatureFlag,
  FeatureFlagSchema,
} from '@/database/schemas/feature-flag.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { AnnouncementService } from '@/system/announcement.service';
import { SecurityEventService } from '@/system/security-event.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminSystemService } from './admin-system.service';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';
import { User } from '@/database/schemas/user.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { Post } from '@/database/schemas/post.schema';
import { Reply } from '@/database/schemas/reply.schema';
import { Circle } from '@/database/schemas/circle.schema';
import { CircleProposal } from '@/database/schemas/circle-proposal.schema';
import { GovernanceCase } from '@/database/schemas/governance-case.schema';
import { ContentReviewRequest } from '@/database/schemas/content-review-request.schema';
import {
  PublicAccessConfig,
  PublicAccessConfigSchema,
} from '@/database/schemas/public-access-config.schema';
import { PublicAccessService } from '@/system/public-access.service';

const ADMIN: AdminPrincipal = {
  userId: 'admin-user',
  username: 'admin',
  browserSessionId: 'browser-session',
};

describe('AdminSystemService integration', () => {
  jest.setTimeout(120_000);
  let replicaSet: MongoMemoryReplSet;
  let moduleRef: TestingModule;
  let connection: Connection;
  let service: AdminSystemService;
  let announcementService: AnnouncementService;
  let auditService: AdminAuditService;
  const publicAccessServiceMock = {
    getPublicConfig: jest.fn(),
    normalizeSiteOrigin: jest.fn((value: string) => value.trim().replace(/\/+$/u, '')),
    normalizeApiBaseUrl: jest.fn((value: string) => value.trim().replace(/\/+$/u, '')),
    serialize: jest.fn((config: PublicAccessConfig) => ({
      siteOrigin: config.siteOrigin,
      apiBaseUrl: config.apiBaseUrl,
      guideUrl: `${config.siteOrigin}/guide.md`,
      version: config.version,
      updatedAt: config.updatedAt.toISOString(),
    })),
    invalidateGuideCache: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Announcement.name, schema: AnnouncementSchema },
          { name: FeatureFlag.name, schema: FeatureFlagSchema },
          { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
          { name: PublicAccessConfig.name, schema: PublicAccessConfigSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        AdminAuditService,
        FeatureFlagService,
        AnnouncementService,
        AdminSystemService,
        { provide: PublicAccessService, useValue: publicAccessServiceMock },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(Agent.name), useValue: {} },
        { provide: getModelToken(Post.name), useValue: {} },
        { provide: getModelToken(Reply.name), useValue: {} },
        { provide: getModelToken(Circle.name), useValue: {} },
        { provide: getModelToken(CircleProposal.name), useValue: {} },
        { provide: getModelToken(GovernanceCase.name), useValue: {} },
        { provide: getModelToken(ContentReviewRequest.name), useValue: {} },
        {
          provide: SecurityEventService,
          useValue: { list: jest.fn() },
        },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(AdminSystemService);
    announcementService = moduleRef.get(AnnouncementService);
    auditService = moduleRef.get(AdminAuditService);
    await Promise.all([
      connection.model(Announcement.name).init(),
      connection.model(FeatureFlag.name).init(),
      connection.model(AdminAuditLog.name).init(),
      connection.model(PublicAccessConfig.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      connection.model(Announcement.name).deleteMany({}),
      connection.model(FeatureFlag.name).deleteMany({}),
      connection.model(AdminAuditLog.name).deleteMany({}),
      connection.model(PublicAccessConfig.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  function announcementInput() {
    return {
      title: '维护通知',
      body: '服务将在今晚进行维护。',
      kind: 'MAINTENANCE' as const,
      startsAt: '2026-07-12T10:00:00.000Z',
      endsAt: '2026-07-13T10:00:00.000Z',
      dismissible: true,
      linkUrl: '/status',
    };
  }

  it('records announcement actions without a required reason while preserving version checks', async () => {
    const created = await service.createAnnouncement(ADMIN, announcementInput());
    expect(created.status).toBe('DRAFT');

    const updated = await service.updateAnnouncement(ADMIN, created.id, {
      expectedUpdatedAt: created.updatedAt,
      title: '维护通知更新',
    });
    expect(updated.title).toBe('维护通知更新');

    const published = await service.publishAnnouncement(ADMIN, created.id, {
      expectedUpdatedAt: updated.updatedAt,
    });
    expect(published.status).toBe('PUBLISHED');

    await expect(
      service.updateAnnouncement(ADMIN, created.id, {
        expectedUpdatedAt: published.updatedAt,
        title: '尝试直接修改',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const withdrawn = await service.withdrawAnnouncement(ADMIN, created.id, {
      expectedUpdatedAt: published.updatedAt,
    });
    expect(withdrawn.status).toBe('WITHDRAWN');

    await expect(
      service.publishAnnouncement(ADMIN, created.id, {
        expectedUpdatedAt: withdrawn.updatedAt,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.withdrawAnnouncement(ADMIN, created.id, {
        expectedUpdatedAt: withdrawn.updatedAt,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const draftToDelete = await service.createAnnouncement(ADMIN, announcementInput());
    await expect(
      service.deleteAnnouncementDraft(ADMIN, draftToDelete.id, {
        expectedUpdatedAt: draftToDelete.updatedAt,
      }),
    ).resolves.toEqual({ deleted: true });

    const auditEntries = await connection.model(AdminAuditLog.name).find({ targetType: 'ANNOUNCEMENT' }).lean();
    expect(auditEntries).toHaveLength(6);
    expect(auditEntries.every((entry) => entry.reason === null)).toBe(true);
  });

  it('rolls back announcement creation when audit persistence fails', async () => {
    jest.spyOn(auditService, 'record').mockRejectedValueOnce(new Error('audit failed'));
    await expect(
      service.createAnnouncement(ADMIN, announcementInput()),
    ).rejects.toThrow('audit failed');
    expect(await connection.model(Announcement.name).countDocuments()).toBe(0);
  });

  it('returns single-field active announcements for public and Agent consumers', async () => {
    const created = await service.createAnnouncement(ADMIN, {
      ...announcementInput(),
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await service.publishAnnouncement(ADMIN, created.id, {
      expectedUpdatedAt: created.updatedAt,
    });

    const activeAnnouncements = await announcementService.listActive();
    expect(activeAnnouncements).toContainEqual(
      expect.objectContaining({
        id: created.id,
        title: created.title,
        body: created.body,
      }),
    );
    expect(activeAnnouncements[0]).not.toHaveProperty('titleZh');
    expect(activeAnnouncements[0]).not.toHaveProperty('bodyZh');
  });

  it('updates only a fixed feature flag and requires the current version', async () => {
    const created = await service.updateFeatureFlag(
      ADMIN,
      FEATURE_FLAG_KEYS.REGISTRATION,
      {
        enabled: false,
      },
    );
    expect(created).toMatchObject({
      key: FEATURE_FLAG_KEYS.REGISTRATION,
      enabled: false,
    });

    await expect(
      service.updateFeatureFlag(ADMIN, FEATURE_FLAG_KEYS.REGISTRATION, {
        enabled: true,
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const flags = await service.listFeatureFlags();
    expect(flags).toHaveLength(7);
    expect(flags.find((flag) => flag.key === FEATURE_FLAG_KEYS.REGISTRATION)?.enabled).toBe(false);
  });

  it('updates public access addresses with version checks and no reason field', async () => {
    const first = await service.updatePublicAccessConfig(ADMIN, {
      siteOrigin: 'https://skynet.example.com/',
      apiBaseUrl: 'https://api.skynet.example.com/api/v1/',
      expectedVersion: 0,
    });
    expect(first).toMatchObject({
      siteOrigin: 'https://skynet.example.com',
      apiBaseUrl: 'https://api.skynet.example.com/api/v1',
      version: 1,
    });
    await expect(
      service.updatePublicAccessConfig(ADMIN, {
        siteOrigin: 'https://other.example.com',
        apiBaseUrl: 'https://api.other.example.com/api/v1',
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(publicAccessServiceMock.invalidateGuideCache).toHaveBeenCalledWith(0);
    const audit = await connection.model(AdminAuditLog.name).findOne({
      action: 'PUBLIC_ACCESS_CONFIG_UPDATED',
    });
    expect(audit).toMatchObject({ reason: null });
    expect(audit?.changes).toMatchObject({
      before: { version: 0 },
      after: { version: 1 },
    });
  });
});
