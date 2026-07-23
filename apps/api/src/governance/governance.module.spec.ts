import { MODULE_METADATA } from '@nestjs/common/constants';
import { ForumModule } from '@/forum/forum.module';
import { ForumService } from '@/forum/forum.service';
import { GovernanceModule } from './governance.module';
import { GovernanceDeadlineProcessor } from './governance-deadline.processor';
import { GovernanceDeadlinePublisher } from './governance-deadline.publisher';
import { GovernanceDeadlineService } from './governance-deadline.service';
import { GovernanceDeadlineQueueEvents } from './governance-deadline.events';

describe('GovernanceModule', () => {
  it('imports the module that exports ForumService', () => {
    const governanceImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      GovernanceModule,
    ) as readonly unknown[];
    const forumExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ForumModule,
    ) as readonly unknown[];

    expect(governanceImports).toContain(ForumModule);
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
