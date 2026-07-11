import { Global, Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { AnnouncementService } from './announcement.service';
import { FeatureFlagService } from './feature-flag.service';
import { SecurityEventService } from './security-event.service';

@Global()
@Module({
  controllers: [SystemController],
  providers: [AnnouncementService, FeatureFlagService, SecurityEventService],
  exports: [AnnouncementService, FeatureFlagService, SecurityEventService],
})
export class SystemModule {}
