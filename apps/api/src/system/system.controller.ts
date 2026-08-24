import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@/auth/decorators/public.decorator';
import { AnnouncementService } from './announcement.service';
import { PublicAccessService } from './public-access.service';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { systemErrors } from '@/common/errors/business-errors';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';
import { getReleaseContract } from './release-contract';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly publicAccessService: PublicAccessService,
  ) {}

  @Public()
  @Get('announcements/active')
  activeAnnouncements() {
    return this.announcementService.listActive();
  }

  @Public()
  @Get('public-config')
  publicConfig() {
    return this.publicAccessService.getPublicConfig();
  }

  @Public()
  @Get('agent-guide')
  @AgentApi(AGENT_API_CAPABILITIES.GET_AGENT_GUIDE)
  async agentGuide(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Query('bootstrap') bootstrap: string | undefined,
    @CurrentUser() user: JwtAuthUser | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const agentKey = authorization?.replace(/^Bearer\s+/iu, '').trim();
    let guide;
    if (bootstrap) {
      guide = await this.publicAccessService.consumeBootstrap(bootstrap);
    } else if (agentKey?.startsWith('sk_live_') && user?.authType === 'agent') {
      guide = await this.publicAccessService.renderGuideForAuthenticatedAgent();
    } else {
      throw systemErrors.bootstrapAuthRequired();
    }
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader('Content-Language', 'zh-CN');
    response.setHeader('Cache-Control', guide.cacheControl);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('ETag', guide.etag);
    response.setHeader(
      'X-Skynet-Agent-Guide-Revision',
      getReleaseContract().agentGuideRevision,
    );
    if (!bootstrap && ifNoneMatch === guide.etag) {
      response.status(304).end();
      return;
    }
    response.status(200).send(guide.content);
  }

  @Public()
  @Get('governance-guide')
  @AgentApi(AGENT_API_CAPABILITIES.GET_AGENT_GUIDE)
  async governanceGuide(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @CurrentUser() user: JwtAuthUser | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const agentKey = authorization?.replace(/^Bearer\s+/iu, '').trim();
    if (!agentKey?.startsWith('sk_live_') || user?.authType !== 'agent') {
      throw systemErrors.bootstrapAuthRequired();
    }
    const guide = await this.publicAccessService.renderGovernanceGuide();
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader('Content-Language', 'zh-CN');
    response.setHeader('Cache-Control', guide.cacheControl);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('ETag', guide.etag);
    response.setHeader(
      'X-Skynet-Governance-Guide-Revision',
      getReleaseContract().governanceGuideRevision,
    );
    if (ifNoneMatch === guide.etag) {
      response.status(304).end();
      return;
    }
    response.status(200).send(guide.content);
  }
}
