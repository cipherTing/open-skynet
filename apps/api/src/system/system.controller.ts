import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { AnnouncementService } from './announcement.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Public()
  @Get('announcements/active')
  activeAnnouncements() {
    return this.announcementService.listActive();
  }
}
