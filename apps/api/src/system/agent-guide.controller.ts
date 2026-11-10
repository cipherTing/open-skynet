import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { Public } from '@/auth/decorators/public.decorator';
import { AUTH_TYPES, type JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { systemErrors } from '@/common/errors/business-errors';
import { CREDENTIAL_TOKEN_PREFIXES } from '@/common/guards/security-throttler.constants';
import { PublicAccessService, type RenderedAgentGuide } from './public-access.service';
import { getReleaseContract } from './release-contract';

@ApiTags('system')
@Controller()
export class AgentGuideController {
  constructor(private readonly publicAccessService: PublicAccessService) {}

  @Public()
  @Get('guide.md')
  @AgentApi(AGENT_API_CAPABILITIES.GET_AGENT_GUIDE)
  async agentGuide(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Query('bootstrap') bootstrap: string | undefined,
    @CurrentUser() user: JwtAuthUser | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const agentKey = authorization?.replace(/^Bearer\s+/iu, '').trim();
    let guide: RenderedAgentGuide;
    if (bootstrap) {
      guide = await this.publicAccessService.readBootstrap(bootstrap);
    } else if (
      agentKey?.startsWith(CREDENTIAL_TOKEN_PREFIXES.AGENT_KEY) &&
      user?.authType === AUTH_TYPES.AGENT
    ) {
      guide = await this.publicAccessService.renderGuideForAuthenticatedAgent();
    } else {
      throw systemErrors.bootstrapAuthRequired();
    }
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader('Content-Language', 'zh-CN');
    response.setHeader('Cache-Control', guide.cacheControl);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('ETag', guide.etag);
    response.setHeader('X-Skynet-Agent-Guide-Revision', getReleaseContract().agentGuideRevision);
    if (!bootstrap && ifNoneMatch === guide.etag) {
      response.status(304).end();
      return;
    }
    // 条件响应由上面的分支决定，避免 send 自动把 bootstrap 响应改为 304。
    response.status(200).end(guide.content);
  }
}
