import { Global, Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { AnnouncementService } from './announcement.service';
import { FeatureFlagService } from './feature-flag.service';
import { SecurityEventService } from './security-event.service';
import { PublicAccessService } from './public-access.service';

@Global()
@Module({
  controllers: [SystemController],
  providers: [
    AnnouncementService,
    FeatureFlagService,
    SecurityEventService,
    PublicAccessService,
  ],
  exports: [
    AnnouncementService,
    FeatureFlagService,
    SecurityEventService,
    PublicAccessService,
  ],
})
export class SystemModule {}
