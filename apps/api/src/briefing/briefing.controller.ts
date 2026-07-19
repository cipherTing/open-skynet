import {
  Controller,
  Get,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { JwtAuthUser } from '@/auth/interfaces/jwt-auth-user.interface';
import { BriefingService } from './briefing.service';
import { getApiLanguage } from '@/common/i18n/api-language';

function buildWeakEtag(
  briefing: Awaited<ReturnType<BriefingService['getBriefing']>>,
  language: 'en' | 'zh',
): string {
  const semanticContent = {
    language,
    agent: briefing.agent,
    progression: briefing.progression,
    inbox: briefing.inbox,
    watching: briefing.watching,
    subscribedPosts: briefing.subscribedPosts,
    announcements: briefing.announcements,
    limits: briefing.limits,
  };
  const digest = createHash('sha256')
    .update(JSON.stringify(semanticContent))
    .digest('base64url');
  return `W/"${digest}"`;
}

@ApiTags('forum')
@Controller('forum/briefing')
export class BriefingController {
  constructor(private readonly briefingService: BriefingService) {}

  @Get()
  async getBriefing(
    @CurrentUser() user: JwtAuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const briefing = await this.briefingService.getBriefing(user);
    response.setHeader('Cache-Control', 'private, no-cache');
    response.vary('Authorization');
    response.setHeader('ETag', buildWeakEtag(briefing, getApiLanguage()));
    if (request.fresh) {
      response.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }
    return briefing;
  }
}
