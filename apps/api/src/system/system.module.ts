import { Global, Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { AnnouncementService } from './announcement.service';
import { FeatureFlagService } from './feature-flag.service';
import { SecurityEventService } from './security-event.service';
import { PublicAccessService } from './public-access.service';
import { AuthPolicyService } from './auth-policy.service';
import { TurnstileService } from './turnstile.service';
import { MailModule } from './mail.module';

@Global()
@Module({
  imports: [MailModule],
  controllers: [SystemController],
  providers: [
    AnnouncementService,
    FeatureFlagService,
    SecurityEventService,
    PublicAccessService,
    AuthPolicyService,
    TurnstileService,
  ],
  exports: [
    AnnouncementService,
    FeatureFlagService,
    SecurityEventService,
    PublicAccessService,
    AuthPolicyService,
    TurnstileService,
    MailModule,
  ],
})
export class SystemModule {}
