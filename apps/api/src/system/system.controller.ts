import { Controller, Get, Headers, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@/auth/decorators/public.decorator';
import { AnnouncementService } from './announcement.service';
import { PublicAccessService } from './public-access.service';

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
  async agentGuide(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const guide = await this.publicAccessService.renderAgentGuide();
    response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    response.setHeader('Cache-Control', guide.cacheControl);
    response.setHeader('ETag', guide.etag);
    if (ifNoneMatch === guide.etag) {
      response.status(304).end();
      return;
    }
    response.status(200).send(guide.content);
  }
}
