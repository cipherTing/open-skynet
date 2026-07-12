import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
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
import { SecurityEventService } from '@/system/security-event.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminSystemService } from './admin-system.service';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';

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
  let auditService: AdminAuditService;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(replicaSet.getUri()),
        MongooseModule.forFeature([
          { name: Announcement.name, schema: AnnouncementSchema },
          { name: FeatureFlag.name, schema: FeatureFlagSchema },
          { name: AdminAuditLog.name, schema: AdminAuditLogSchema },
        ]),
      ],
      providers: [
        DatabaseService,
        AdminAuditService,
        FeatureFlagService,
        AdminSystemService,
        {
          provide: SecurityEventService,
          useValue: { list: jest.fn() },
        },
      ],
    }).compile();
    connection = moduleRef.get<Connection>(getConnectionToken());
    service = moduleRef.get(AdminSystemService);
    auditService = moduleRef.get(AdminAuditService);
    await Promise.all([
      connection.model(Announcement.name).init(),
      connection.model(FeatureFlag.name).init(),
      connection.model(AdminAuditLog.name).init(),
    ]);
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      connection.model(Announcement.name).deleteMany({}),
      connection.model(FeatureFlag.name).deleteMany({}),
      connection.model(AdminAuditLog.name).deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await moduleRef.close();
    await replicaSet.stop();
  });

  function announcementInput() {
    return {
      titleZh: '维护通知',
      titleEn: 'Maintenance notice',
      bodyZh: '服务将在今晚进行维护。',
      bodyEn: 'The service will undergo maintenance tonight.',
      kind: 'MAINTENANCE' as const,
      startsAt: '2026-07-12T10:00:00.000Z',
      endsAt: '2026-07-13T10:00:00.000Z',
      dismissible: true,
      linkUrl: '/status',
      reason: '准备今晚维护公告',
    };
  }

  it('creates, publishes, and audits an announcement with version checks', async () => {
    const created = await service.createAnnouncement(ADMIN, announcementInput());
    expect(created.status).toBe('DRAFT');

    const published = await service.publishAnnouncement(ADMIN, created.id, {
      expectedUpdatedAt: created.updatedAt,
      reason: '维护窗口已经确认',
    });
    expect(published.status).toBe('PUBLISHED');

    await expect(
      service.updateAnnouncement(ADMIN, created.id, {
        expectedUpdatedAt: published.updatedAt,
        titleZh: '尝试直接修改',
        reason: '验证发布态保护',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const auditCount = await connection.model(AdminAuditLog.name).countDocuments({
      targetId: created.id,
    });
    expect(auditCount).toBe(2);
  });

  it('rolls back announcement creation when audit persistence fails', async () => {
    jest.spyOn(auditService, 'record').mockRejectedValueOnce(new Error('audit failed'));
    await expect(
      service.createAnnouncement(ADMIN, announcementInput()),
    ).rejects.toThrow('audit failed');
    expect(await connection.model(Announcement.name).countDocuments()).toBe(0);
  });

  it('updates only a fixed feature flag and requires the current version', async () => {
    const created = await service.updateFeatureFlag(
      ADMIN,
      FEATURE_FLAG_KEYS.REGISTRATION,
      {
        enabled: false,
        reason: '临时暂停新账号注册',
        reviewAt: '2026-07-13T10:00:00.000Z',
      },
    );
    expect(created).toMatchObject({
      key: FEATURE_FLAG_KEYS.REGISTRATION,
      enabled: false,
    });

    await expect(
      service.updateFeatureFlag(ADMIN, FEATURE_FLAG_KEYS.REGISTRATION, {
        enabled: true,
        reason: '使用过期版本进行测试',
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const flags = await service.listFeatureFlags();
    expect(flags).toHaveLength(5);
    expect(flags.find((flag) => flag.key === FEATURE_FLAG_KEYS.REGISTRATION)?.enabled).toBe(false);
  });
});
