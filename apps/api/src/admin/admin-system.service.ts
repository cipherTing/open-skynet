import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  ANNOUNCEMENT_STATUSES,
  Announcement,
  type AnnouncementStatus,
} from '@/database/schemas/announcement.schema';
import {
  FeatureFlag,
  type FeatureFlagKey,
} from '@/database/schemas/feature-flag.schema';
import { DatabaseService } from '@/database/database.service';
import { FeatureFlagService } from '@/system/feature-flag.service';
import { SecurityEventService } from '@/system/security-event.service';
import { AdminAuditService } from './admin-audit.service';
import { ADMIN_AUDIT_ACTIONS } from './admin.constants';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import type { VersionedAnnouncementDto } from './dto/versioned-announcement.dto';
import type { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import type { ListAnnouncementsDto } from './dto/list-announcements.dto';
import type { ListSecurityEventsDto } from './dto/list-security-events.dto';
import {
  DEFAULT_PUBLIC_API_BASE_URL,
  DEFAULT_PUBLIC_SITE_ORIGIN,
  PUBLIC_ACCESS_CONFIG_KEY,
  PublicAccessConfig,
} from '@/database/schemas/public-access-config.schema';
import { PublicAccessService } from '@/system/public-access.service';
import type { UpdatePublicAccessConfigDto } from './dto/update-public-access-config.dto';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureObjectId(id: string, message: string): void {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException(message);
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function isDuplicateKeyError(error: unknown): error is { code: 11000 } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class AdminSystemService {
  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<Announcement>,
    @InjectModel(FeatureFlag.name)
    private readonly featureFlagModel: Model<FeatureFlag>,
    @InjectModel(PublicAccessConfig.name)
    private readonly publicAccessConfigModel: Model<PublicAccessConfig>,
    private readonly databaseService: DatabaseService,
    private readonly auditService: AdminAuditService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly securityEventService: SecurityEventService,
    private readonly publicAccessService: PublicAccessService,
  ) {}

  getPublicAccessConfig() {
    return this.publicAccessService.getPublicConfig();
  }

  async updatePublicAccessConfig(
    admin: AdminPrincipal,
    dto: UpdatePublicAccessConfigDto,
  ) {
    const siteOrigin = this.publicAccessService.normalizeSiteOrigin(dto.siteOrigin);
    const apiBaseUrl = this.publicAccessService.normalizeApiBaseUrl(dto.apiBaseUrl);
    const result = await this.databaseService.$transaction(async (session) => {
      const config = await this.publicAccessConfigModel.findOne(
        { key: PUBLIC_ACCESS_CONFIG_KEY },
        null,
        { session },
      );
      const currentVersion = config?.version ?? 0;
      if (currentVersion !== dto.expectedVersion) {
        throw new ConflictException('公开访问地址已经发生变化，请刷新后重新修改');
      }
      const previous = {
        siteOrigin: config?.siteOrigin ?? DEFAULT_PUBLIC_SITE_ORIGIN,
        apiBaseUrl: config?.apiBaseUrl ?? DEFAULT_PUBLIC_API_BASE_URL,
        version: currentVersion,
      };
      if (previous.siteOrigin === siteOrigin && previous.apiBaseUrl === apiBaseUrl) {
        throw new BadRequestException('公开访问地址没有发生变化');
      }

      const nextConfig = config ?? new this.publicAccessConfigModel({ key: PUBLIC_ACCESS_CONFIG_KEY });
      nextConfig.siteOrigin = siteOrigin;
      nextConfig.apiBaseUrl = apiBaseUrl;
      nextConfig.version = currentVersion + 1;
      nextConfig.updatedByUserId = admin.userId;
      await nextConfig.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.PUBLIC_ACCESS_CONFIG_UPDATED,
        targetType: 'PUBLIC_ACCESS_CONFIG',
        targetId: PUBLIC_ACCESS_CONFIG_KEY,
        reason: null,
        changes: {
          before: previous,
          after: {
            siteOrigin,
            apiBaseUrl,
            version: nextConfig.version,
          },
        },
        session,
      });
      return {
        config: this.publicAccessService.serialize(nextConfig),
        previousVersion: currentVersion,
      };
    });
    await this.publicAccessService.invalidateGuideCache(result.previousVersion);
    return result.config;
  }

  async listAnnouncements(dto: ListAnnouncementsDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const where: FilterQuery<Announcement> = {};
    if (dto.status) where.status = dto.status;
    if (dto.kind) where.kind = dto.kind;
    if (dto.search?.trim()) {
      const pattern = escapeRegex(dto.search.trim());
      where.$or = [
        { title: { $regex: pattern, $options: 'i' } },
        { body: { $regex: pattern, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.announcementModel
        .find(where)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.announcementModel.countDocuments(where),
    ]);
    return {
      items: items.map((item) => this.serializeAnnouncement(item)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createAnnouncement(admin: AdminPrincipal, dto: CreateAnnouncementDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = parseOptionalDate(dto.endsAt);
    this.assertAnnouncementRange(startsAt, endsAt);

    return this.databaseService.$transaction(async (session) => {
      const announcement = new this.announcementModel({
        title: dto.title.trim(),
        body: dto.body.trim(),
        kind: dto.kind,
        status: ANNOUNCEMENT_STATUSES.DRAFT,
        startsAt,
        endsAt,
        dismissible: dto.dismissible,
        linkUrl: dto.linkUrl?.trim() || null,
        createdByUserId: admin.userId,
        updatedByUserId: admin.userId,
      });
      await announcement.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.ANNOUNCEMENT_CREATED,
        targetType: 'ANNOUNCEMENT',
        targetId: announcement.id,
        reason: null,
        changes: {
          status: announcement.status,
          kind: announcement.kind,
          startsAt: announcement.startsAt.toISOString(),
        },
        session,
      });
      return this.serializeAnnouncement(announcement);
    });
  }

  async updateAnnouncement(
    admin: AdminPrincipal,
    announcementId: string,
    dto: UpdateAnnouncementDto,
  ) {
    ensureObjectId(announcementId, '公告不存在');
    return this.databaseService.$transaction(async (session) => {
      const announcement = await this.announcementModel.findById(
        announcementId,
        null,
        { session },
      );
      this.assertAnnouncementVersion(announcement, dto.expectedUpdatedAt);
      if (announcement.status !== ANNOUNCEMENT_STATUSES.DRAFT) {
        throw new ConflictException('只有草稿公告可以修改');
      }

      const updatedFields: string[] = [];
      const setString = (
        field: 'title' | 'body',
        value: string | undefined,
      ) => {
        if (value === undefined) return;
        announcement[field] = value.trim();
        updatedFields.push(field);
      };
      setString('title', dto.title);
      setString('body', dto.body);
      if (dto.kind !== undefined) {
        announcement.kind = dto.kind;
        updatedFields.push('kind');
      }
      if (dto.startsAt !== undefined) {
        announcement.startsAt = new Date(dto.startsAt);
        updatedFields.push('startsAt');
      }
      if (dto.endsAt !== undefined) {
        announcement.endsAt = parseOptionalDate(dto.endsAt);
        updatedFields.push('endsAt');
      }
      if (dto.dismissible !== undefined) {
        announcement.dismissible = dto.dismissible;
        updatedFields.push('dismissible');
      }
      if (dto.linkUrl !== undefined) {
        announcement.linkUrl = dto.linkUrl?.trim() || null;
        updatedFields.push('linkUrl');
      }
      if (updatedFields.length === 0) {
        throw new BadRequestException('至少需要修改一个公告字段');
      }
      this.assertAnnouncementRange(announcement.startsAt, announcement.endsAt);
      announcement.updatedByUserId = admin.userId;
      await announcement.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
        targetType: 'ANNOUNCEMENT',
        targetId: announcement.id,
        reason: null,
        changes: {
          updatedFields: updatedFields.join(','),
          previousUpdatedAt: dto.expectedUpdatedAt,
        },
        session,
      });
      return this.serializeAnnouncement(announcement);
    });
  }

  publishAnnouncement(
    admin: AdminPrincipal,
    announcementId: string,
    dto: VersionedAnnouncementDto,
  ) {
    return this.changeAnnouncementStatus(
      admin,
      announcementId,
      dto,
      ANNOUNCEMENT_STATUSES.PUBLISHED,
    );
  }

  withdrawAnnouncement(
    admin: AdminPrincipal,
    announcementId: string,
    dto: VersionedAnnouncementDto,
  ) {
    return this.changeAnnouncementStatus(
      admin,
      announcementId,
      dto,
      ANNOUNCEMENT_STATUSES.WITHDRAWN,
    );
  }

  async deleteAnnouncementDraft(
    admin: AdminPrincipal,
    announcementId: string,
    dto: VersionedAnnouncementDto,
  ) {
    ensureObjectId(announcementId, '公告不存在');
    return this.databaseService.$transaction(async (session) => {
      const announcement = await this.announcementModel.findById(
        announcementId,
        null,
        { session },
      );
      this.assertAnnouncementVersion(announcement, dto.expectedUpdatedAt);
      if (announcement.status !== ANNOUNCEMENT_STATUSES.DRAFT) {
        throw new ConflictException('只有草稿公告可以删除');
      }
      await this.announcementModel.deleteOne({ _id: announcement.id }, { session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action: ADMIN_AUDIT_ACTIONS.ANNOUNCEMENT_DELETED,
        targetType: 'ANNOUNCEMENT',
        targetId: announcement.id,
        reason: null,
        changes: { previousStatus: announcement.status },
        session,
      });
      return { deleted: true };
    });
  }

  listFeatureFlags() {
    return this.featureFlagService.list();
  }

  async updateFeatureFlag(
    admin: AdminPrincipal,
    key: FeatureFlagKey,
    dto: UpdateFeatureFlagDto,
  ) {
    try {
      return await this.databaseService.$transaction(async (session) => {
        let flag = await this.featureFlagModel.findOne({ key }, null, { session });
        if (dto.expectedUpdatedAt) {
          if (!flag || flag.updatedAt.getTime() !== new Date(dto.expectedUpdatedAt).getTime()) {
            throw new ConflictException('功能开关已被其他管理员修改，请刷新后重试');
          }
        } else if (flag) {
          throw new ConflictException('功能开关已存在，请刷新后重试');
        }
        const previousEnabled = flag?.enabled ?? this.featureFlagService.defaultValue(key);
        if (!flag) {
          flag = new this.featureFlagModel({ key });
        }
        flag.enabled = dto.enabled;
        flag.updatedByUserId = admin.userId;
        await flag.save({ session });
        await this.auditService.record({
          actorUserId: admin.userId,
          action: ADMIN_AUDIT_ACTIONS.FEATURE_FLAG_UPDATED,
          targetType: 'FEATURE_FLAG',
          targetId: key,
          reason: null,
          changes: {
            previousEnabled,
            nextEnabled: flag.enabled,
          },
          session,
        });
        return this.featureFlagService.serialize(flag);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('功能开关已被其他管理员修改，请刷新后重试');
      }
      throw error;
    }
  }

  listSecurityEvents(dto: ListSecurityEventsDto) {
    return this.securityEventService.list(dto);
  }

  private async changeAnnouncementStatus(
    admin: AdminPrincipal,
    announcementId: string,
    dto: VersionedAnnouncementDto,
    nextStatus: AnnouncementStatus,
  ) {
    ensureObjectId(announcementId, '公告不存在');
    return this.databaseService.$transaction(async (session) => {
      const announcement = await this.announcementModel.findById(
        announcementId,
        null,
        { session },
      );
      this.assertAnnouncementVersion(announcement, dto.expectedUpdatedAt);
      const previousStatus = announcement.status;
      if (
        nextStatus === ANNOUNCEMENT_STATUSES.PUBLISHED &&
        previousStatus !== ANNOUNCEMENT_STATUSES.DRAFT
      ) {
        throw new ConflictException('只有草稿公告可以发布');
      }
      if (
        nextStatus === ANNOUNCEMENT_STATUSES.WITHDRAWN &&
        previousStatus !== ANNOUNCEMENT_STATUSES.PUBLISHED
      ) {
        throw new ConflictException('只有已发布公告可以撤回');
      }
      this.assertAnnouncementRange(announcement.startsAt, announcement.endsAt);
      announcement.status = nextStatus;
      announcement.updatedByUserId = admin.userId;
      await announcement.save({ session });
      await this.auditService.record({
        actorUserId: admin.userId,
        action:
          nextStatus === ANNOUNCEMENT_STATUSES.PUBLISHED
            ? ADMIN_AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISHED
            : ADMIN_AUDIT_ACTIONS.ANNOUNCEMENT_WITHDRAWN,
        targetType: 'ANNOUNCEMENT',
        targetId: announcement.id,
        reason: null,
        changes: { previousStatus, nextStatus },
        session,
      });
      return this.serializeAnnouncement(announcement);
    });
  }

  private assertAnnouncementVersion(
    announcement: Announcement | null,
    expectedUpdatedAt: string,
  ): asserts announcement is Announcement {
    if (!announcement) throw new NotFoundException('公告不存在');
    if (announcement.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException('公告已被其他管理员修改，请刷新后重试');
    }
  }

  private assertAnnouncementRange(startsAt: Date, endsAt: Date | null): void {
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      throw new BadRequestException('公告时间格式无效');
    }
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('公告结束时间必须晚于开始时间');
    }
  }

  private serializeAnnouncement(item: Announcement) {
    return {
      id: item.id,
      title: item.title,
      body: item.body,
      kind: item.kind,
      status: item.status,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt?.toISOString() ?? null,
      dismissible: item.dismissible,
      linkUrl: item.linkUrl,
      createdByUserId: item.createdByUserId,
      updatedByUserId: item.updatedByUserId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
