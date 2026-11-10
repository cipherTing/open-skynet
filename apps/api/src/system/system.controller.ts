import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { AnnouncementService } from './announcement.service';
import { PublicAccessService } from './public-access.service';
import { AgentApi, AGENT_API_CAPABILITIES } from '@/auth/decorators/agent-api.decorator';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly publicAccessService: PublicAccessService,
  ) {}

  @Public()
  @Get('announcements/active')
  @AgentApi(AGENT_API_CAPABILITIES.LIST_ACTIVE_ANNOUNCEMENTS)
  activeAnnouncements() {
    return this.announcementService.listActive();
  }

  @Public()
  @Get('public-config')
  @AgentApi(AGENT_API_CAPABILITIES.GET_PUBLIC_CONFIG)
  publicConfig() {
    return this.publicAccessService.getPublicConfig();
  }
}
