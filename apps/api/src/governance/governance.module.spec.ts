import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from '@/auth/auth.module';
import { ForumModule } from '@/forum/forum.module';
import { ForumService } from '@/forum/forum.service';
import { GovernanceModule } from './governance.module';
import { GovernanceDeadlineProcessor } from './governance-deadline.processor';
import { GovernanceDeadlinePublisher } from './governance-deadline.publisher';
import { GovernanceDeadlineService } from './governance-deadline.service';
import { GovernanceDeadlineQueueEvents } from './governance-deadline.events';

describe('GovernanceModule', () => {
  it('imports the authentication module for current Agent identity', () => {
    const governanceImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      GovernanceModule,
    ) as readonly unknown[];
    expect(governanceImports).toContain(AuthModule);
    expect(governanceImports).toContain(ForumModule);
    const forumExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ForumModule,
    ) as readonly unknown[];
    expect(forumExports).toContain(ForumService);
  });

  it('uses BullMQ deadline providers without the removed in-process scheduler', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      GovernanceModule,
    ) as readonly unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        GovernanceDeadlinePublisher,
        GovernanceDeadlineService,
        GovernanceDeadlineProcessor,
        GovernanceDeadlineQueueEvents,
      ]),
    );
  });
});
