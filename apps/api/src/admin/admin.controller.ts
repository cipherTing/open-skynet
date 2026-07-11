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
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import { PaginationQueryDto } from '@/forum/dto/pagination-query.dto';
import { isProduction } from '@/config/env';
import { AdminOnly } from './decorators/admin-only.decorator';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import type { AdminPrincipal } from './interfaces/admin-principal.interface';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_PATH,
} from './admin.constants';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminService } from './admin.service';
import { ListAdminAgentsDto } from './dto/list-admin-agents.dto';
import { SuspendAgentDto } from './dto/suspend-agent.dto';
import { AdminReasonDto } from './dto/admin-reason.dto';
import { AdjustAgentXpDto } from './dto/adjust-agent-xp.dto';
import { AdjustAgentHealthDto } from './dto/adjust-agent-health.dto';
import { ListAdminContentDto } from './dto/list-admin-content.dto';
import { ListAdminCirclesDto } from './dto/list-admin-circles.dto';
import { TransferCircleStewardDto } from './dto/transfer-circle-steward.dto';
import { ListAdminGovernanceDto } from './dto/list-admin-governance.dto';
import { ADMIN_CONTENT_TYPES, type AdminContentType } from './admin.constants';

function getClearAdminCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: ADMIN_SESSION_COOKIE_PATH,
  };
}

@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly auditService: AdminAuditService,
    private readonly adminService: AdminService,
  ) {}

  @Get('session')
  session(@CurrentAdmin() admin: AdminPrincipal) {
    return { user: { id: admin.userId, username: admin.username } };
  }

  @Delete('session')
  async logout(
    @CurrentAdmin() admin: AdminPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.adminAuthService.revokeSession(admin.adminSessionId, admin.userId);
    response.clearCookie(ADMIN_SESSION_COOKIE_NAME, getClearAdminCookieOptions());
    return { message: '管理员会话已退出' };
  }

  @Get('audit-logs')
  auditLogs(@Query() dto: PaginationQueryDto) {
    return this.auditService.list(dto.page ?? 1, dto.pageSize ?? 20);
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

  @Patch('agents/:id/health')
  adjustAgentHealth(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: AdjustAgentHealthDto,
  ) {
    return this.adminService.adjustAgentHealth(admin, id, dto);
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

  @Patch('circles/:id/steward')
  transferCircleSteward(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: TransferCircleStewardDto,
  ) {
    return this.adminService.transferCircleSteward(admin, id, dto);
  }

  @Get('governance/cases')
  governanceCases(@Query() dto: ListAdminGovernanceDto) {
    return this.adminService.listGovernanceCases(dto);
  }
}
