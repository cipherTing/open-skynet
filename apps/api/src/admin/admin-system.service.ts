import { Injectable } from '@nestjs/common';
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
import { AuthPolicyService } from '@/system/auth-policy.service';
import { TurnstileService } from '@/system/turnstile.service';
import { MailDeliveryService } from '@/system/mail.service';
import { InvitationCodeService } from '@/auth/invitation-code.service';
import type { UpdateAuthPolicyDto } from './dto/auth-policy.dto';
import { adminErrors } from '@/common/errors/business-errors';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureObjectId(id: string, errorFactory: () => Error): void {
  if (!Types.ObjectId.isValid(id)) throw errorFactory();
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
    private readonly authPolicyService: AuthPolicyService,
    private readonly turnstileService: TurnstileService,
    private readonly mailDeliveryService: MailDeliveryService,
    private readonly invitationCodeService: InvitationCodeService,
  ) {}

  getAuthPolicy() {
    return this.authPolicyService.getAdminConfig();
  }

  async updateAuthPolicy(admin: AdminPrincipal, dto: UpdateAuthPolicyDto) {
    const before = await this.authPolicyService.getAdminConfig();
    const after = await this.authPolicyService.update(dto, admin.userId);
    await this.auditService.record({
      actorUserId: admin.userId,
      action: ADMIN_AUDIT_ACTIONS.AUTH_POLICY_UPDATED,
      targetType: 'AUTH_POLICY',
      targetId: 'global',
      reason: null,
      changes: { before, after },
    });
    return after;
  }

  async testTurnstile(admin: AdminPrincipal, token: string, remoteIp?: string) {
    await this.turnstileService.testConfiguration(token, remoteIp);
    await this.auditService.record({
      actorUserId: admin.userId,
      action: ADMIN_AUDIT_ACTIONS.TURNSTILE_TESTED,
      targetType: 'AUTH_POLICY',
      targetId: 'global',
      reason: null,
      changes: { verified: true },
    });
    return { verified: true };
  }

  async testSmtp(admin: AdminPrincipal, email: string) {
    await this.mailDeliveryService.sendTest(email);
    await this.auditService.record({
      actorUserId: admin.userId,
      action: ADMIN_AUDIT_ACTIONS.SMTP_TESTED,
      targetType: 'AUTH_POLICY',
      targetId: 'global',
      reason: null,
      changes: { verified: true },
    });
    return { verified: true };
  }

  listInvitationCodes(page?: number, pageSize?: number, status?: string) {
    return this.invitationCodeService.list(page, pageSize, status);
  }

  async createInvitationCode(admin: AdminPrincipal, expiresAt?: string) {
    const item = await this.invitationCodeService.create(admin.userId, expiresAt);
    await this.auditService.record({
      actorUserId: admin.userId,
      action: ADMIN_AUDIT_ACTIONS.INVITATION_CODE_CREATED,
      targetType: 'INVITATION_CODE',
      targetId: item.id,
      reason: null,
      changes: { prefix: item.prefix, expiresAt: item.expiresAt },
    });
    return item;
  }

  async revokeInvitationCode(admin: AdminPrincipal, id: string) {
    const item = await this.invitationCodeService.revoke(id);
    await this.auditService.record({
      actorUserId: admin.userId,
      action: ADMIN_AUDIT_ACTIONS.INVITATION_CODE_REVOKED,
      targetType: 'INVITATION_CODE',
      targetId: item.id,
      reason: null,
      changes: { prefix: item.prefix, status: item.status },
    });
    return item;
  }

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
        throw adminErrors.publicAccessVersionConflict();
      }
      const previous = {
        siteOrigin: config?.siteOrigin ?? DEFAULT_PUBLIC_SITE_ORIGIN,
        apiBaseUrl: config?.apiBaseUrl ?? DEFAULT_PUBLIC_API_BASE_URL,
        version: currentVersion,
      };
      if (previous.siteOrigin === siteOrigin && previous.apiBaseUrl === apiBaseUrl) {
        throw adminErrors.publicAccessUnchanged();
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
    ensureObjectId(announcementId, adminErrors.announcementNotFound);
    return this.databaseService.$transaction(async (session) => {
      const announcement = await this.announcementModel.findById(
        announcementId,
        null,
        { session },
      );
      this.assertAnnouncementVersion(announcement, dto.expectedUpdatedAt);
      if (announcement.status !== ANNOUNCEMENT_STATUSES.DRAFT) {
        throw adminErrors.announcementDraftRequired();
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
        throw adminErrors.announcementUpdateRequired();
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
    ensureObjectId(announcementId, adminErrors.announcementNotFound);
    return this.databaseService.$transaction(async (session) => {
      const announcement = await this.announcementModel.findById(
        announcementId,
        null,
        { session },
      );
      this.assertAnnouncementVersion(announcement, dto.expectedUpdatedAt);
      if (announcement.status !== ANNOUNCEMENT_STATUSES.DRAFT) {
        throw adminErrors.announcementDraftRequired();
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
            throw adminErrors.featureFlagVersionConflict();
          }
        } else if (flag) {
          throw adminErrors.featureFlagVersionConflict();
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
        throw adminErrors.featureFlagVersionConflict();
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
    ensureObjectId(announcementId, adminErrors.announcementNotFound);
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
        throw adminErrors.announcementDraftRequired();
      }
      if (
        nextStatus === ANNOUNCEMENT_STATUSES.WITHDRAWN &&
        previousStatus !== ANNOUNCEMENT_STATUSES.PUBLISHED
      ) {
        throw adminErrors.announcementPublishedRequired();
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
    if (!announcement) throw adminErrors.announcementNotFound();
    if (announcement.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw adminErrors.announcementVersionConflict();
    }
  }

  private assertAnnouncementRange(startsAt: Date, endsAt: Date | null): void {
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      throw adminErrors.announcementDateInvalid();
    }
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw adminErrors.announcementDateRangeInvalid();
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
