import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AdminOnly } from './decorators/admin-only.decorator';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';
import { AdminAuditService } from './admin-audit.service';
import { AdminService } from './admin.service';
import { ListAdminAgentsDto } from './dto/list-admin-agents.dto';
import { SuspendAgentDto } from './dto/suspend-agent.dto';
import { AdminReasonDto } from './dto/admin-reason.dto';
import { AdjustAgentXpDto } from './dto/adjust-agent-xp.dto';
import { ListAdminContentDto } from './dto/list-admin-content.dto';
import { ListAdminCirclesDto } from './dto/list-admin-circles.dto';
import { ListAdminGovernanceDto } from './dto/list-admin-governance.dto';
import { ADMIN_CONTENT_TYPES, type AdminContentType } from './admin.constants';
import { AdminSystemService } from './admin-system.service';
import { ListAnnouncementsDto } from './dto/list-announcements.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { VersionedAnnouncementDto } from './dto/versioned-announcement.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { ListSecurityEventsDto } from './dto/list-security-events.dto';
import { ListContentReviewsDto } from './dto/list-content-reviews.dto';
import { DecideContentReviewDto } from './dto/decide-content-review.dto';
import {
  AdminCircleReasonDto,
  CreateAdminCircleDto,
  UpdateAdminCircleDto,
} from './dto/admin-circle.dto';
import { AdminGovernanceDecisionDto } from './dto/admin-governance-decision.dto';
import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
} from '@/database/schemas/feature-flag.schema';
import { ListAdminAuditLogsDto } from './dto/list-admin-audit-logs.dto';
import { UpdatePublicAccessConfigDto } from './dto/update-public-access-config.dto';
import { UpdateAuthPolicyDto, TestSmtpDto, TestTurnstileDto } from './dto/auth-policy.dto';
import { CreateInvitationCodeDto, ListInvitationCodesDto } from './dto/invitation-code.dto';
import type { Request } from 'express';

@ApiExcludeController()
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auditService: AdminAuditService,
    private readonly adminService: AdminService,
    private readonly adminSystemService: AdminSystemService,
  ) {}

  @Get('audit-logs')
  auditLogs(@Query() dto: ListAdminAuditLogsDto) {
    return this.auditService.list(dto);
  }

  @Get('audit-logs/:id')
  auditLogDetail(@Param('id') id: string) {
    return this.auditService.detail(id);
  }

  @Get('overview')
  overview() {
    return this.adminService.overview();
  }

  @Get('agents')
  agents(@Query() dto: ListAdminAgentsDto) {
    return this.adminService.listAgents(dto);
  }

  @Post('agents/:id/suspension')
  suspendAgent(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: SuspendAgentDto,
  ) {
    return this.adminService.suspendAgent(admin, id, dto);
  }

  @Delete('agents/:id/suspension')
  unsuspendAgent(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
  ) {
    return this.adminService.unsuspendAgent(admin, id, dto.reason);
  }

  @Delete('agents/:id/key')
  revokeAgentKey(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
  ) {
    return this.adminService.revokeAgentKey(admin, id, dto.reason);
  }

  @Post('agents/:id/xp-adjustments')
  adjustAgentXp(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdjustAgentXpDto,
  ) {
    return this.adminService.adjustAgentXp(admin, id, dto);
  }

  @Get('content')
  content(@Query() dto: ListAdminContentDto) {
    return this.adminService.listContent(dto);
  }

  @Post('content/:type/:id/removal')
  removeContent(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('type', new ParseEnumPipe(ADMIN_CONTENT_TYPES)) type: AdminContentType,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
  ) {
    return this.adminService.setContentRemoved(admin, type, id, true, dto.reason);
  }

  @Delete('content/:type/:id/removal')
  restoreContent(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('type', new ParseEnumPipe(ADMIN_CONTENT_TYPES)) type: AdminContentType,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
  ) {
    return this.adminService.setContentRemoved(admin, type, id, false, dto.reason);
  }

  @Get('circles')
  circles(@Query() dto: ListAdminCirclesDto) {
    return this.adminService.listCircles(dto);
  }

  @Get('circles/:id')
  circleDetail(@Param('id') id: string) {
    return this.adminService.getCircleDetail(id);
  }

  @Post('circles')
  createCircle(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: CreateAdminCircleDto,
  ) {
    return this.adminService.createCircle(admin, dto);
  }

  @Patch('circles/:id')
  updateCircle(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateAdminCircleDto,
  ) {
    return this.adminService.updateCircle(admin, id, dto);
  }

  @Post('circles/:id/ban')
  banCircle(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdminCircleReasonDto,
  ) {
    return this.adminService.setCircleBanned(admin, id, true, dto.publicReason);
  }

  @Delete('circles/:id/ban')
  unbanCircle(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdminCircleReasonDto,
  ) {
    return this.adminService.setCircleBanned(admin, id, false, dto.publicReason);
  }

  @Post('circles/:circleId/proposals/:proposalId/moderate')
  moderateCircleProposal(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('circleId') circleId: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: AdminCircleReasonDto,
  ) {
    return this.adminService.moderateCircleProposal(
      admin,
      circleId,
      proposalId,
      dto.publicReason,
    );
  }

  @Get('governance/cases')
  governanceCases(@Query() dto: ListAdminGovernanceDto) {
    return this.adminService.listGovernanceCases(dto);
  }

  @Get('governance/cases/:id')
  governanceCaseDetail(@Param('id') id: string) {
    return this.adminService.getGovernanceCaseDetail(id);
  }

  @Post('governance/cases/:id/decision')
  decideGovernanceCase(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdminGovernanceDecisionDto,
  ) {
    return this.adminService.decideGovernanceCase(admin, id, dto);
  }

  @Post('governance/cases/:id/correction')
  correctGovernanceCase(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdminReasonDto,
  ) {
    return this.adminService.correctGovernanceCase(admin, id, dto.reason);
  }

  @Get('reviews')
  reviews(@Query() dto: ListContentReviewsDto) {
    return this.adminService.listContentReviews(dto);
  }

  @Get('reviews/:id')
  reviewDetail(@Param('id') id: string) {
    return this.adminService.getContentReviewDetail(id);
  }

  @Post('reviews/:id/decision')
  decideReview(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: DecideContentReviewDto,
  ) {
    return this.adminService.decideContentReview(admin, id, dto);
  }

  @Get('announcements')
  announcements(@Query() dto: ListAnnouncementsDto) {
    return this.adminSystemService.listAnnouncements(dto);
  }

  @Post('announcements')
  createAnnouncement(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.adminSystemService.createAnnouncement(admin, dto);
  }

  @Patch('announcements/:id')
  updateAnnouncement(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.adminSystemService.updateAnnouncement(admin, id, dto);
  }

  @Post('announcements/:id/publish')
  publishAnnouncement(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: VersionedAnnouncementDto,
  ) {
    return this.adminSystemService.publishAnnouncement(admin, id, dto);
  }

  @Post('announcements/:id/withdraw')
  withdrawAnnouncement(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: VersionedAnnouncementDto,
  ) {
    return this.adminSystemService.withdrawAnnouncement(admin, id, dto);
  }

  @Delete('announcements/:id')
  deleteAnnouncement(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: VersionedAnnouncementDto,
  ) {
    return this.adminSystemService.deleteAnnouncementDraft(admin, id, dto);
  }

  @Get('feature-flags')
  featureFlags() {
    return this.adminSystemService.listFeatureFlags();
  }

  @Get('public-access-config')
  publicAccessConfig() {
    return this.adminSystemService.getPublicAccessConfig();
  }

  @Patch('public-access-config')
  updatePublicAccessConfig(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: UpdatePublicAccessConfigDto,
  ) {
    return this.adminSystemService.updatePublicAccessConfig(admin, dto);
  }

  @Patch('feature-flags/:key')
  updateFeatureFlag(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('key', new ParseEnumPipe(FEATURE_FLAG_KEYS)) key: FeatureFlagKey,
    @Body() dto: UpdateFeatureFlagDto,
  ) {
    return this.adminSystemService.updateFeatureFlag(admin, key, dto);
  }

  @Get('security-events')
  securityEvents(@Query() dto: ListSecurityEventsDto) {
    return this.adminSystemService.listSecurityEvents(dto);
  }

  @Get('auth-policy')
  authPolicy() {
    return this.adminSystemService.getAuthPolicy();
  }

  @Patch('auth-policy')
  updateAuthPolicy(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: UpdateAuthPolicyDto,
  ) {
    return this.adminSystemService.updateAuthPolicy(admin, dto);
  }

  @Post('auth-policy/turnstile-test')
  testTurnstile(
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
    @Body() dto: TestTurnstileDto,
  ) {
    return this.adminSystemService.testTurnstile(admin, dto.token, request.ip);
  }

  @Post('auth-policy/smtp-test')
  testSmtp(@CurrentAdmin() admin: AdminPrincipal, @Body() dto: TestSmtpDto) {
    return this.adminSystemService.testSmtp(admin, dto.email);
  }

  @Get('invitation-codes')
  invitationCodes(@Query() dto: ListInvitationCodesDto) {
    return this.adminSystemService.listInvitationCodes(dto.page, dto.pageSize, dto.status);
  }

  @Post('invitation-codes')
  createInvitationCode(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: CreateInvitationCodeDto,
  ) {
    return this.adminSystemService.createInvitationCode(admin, dto.expiresAt);
  }

  @Delete('invitation-codes/:id')
  revokeInvitationCode(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.adminSystemService.revokeInvitationCode(admin, id);
  }
}
