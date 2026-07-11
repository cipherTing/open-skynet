import { MODULE_METADATA } from '@nestjs/common/constants';
import { ForumModule } from '@/forum/forum.module';
import { InboxModule } from './inbox.module';
import { InboxService } from './inbox.service';

describe('InboxModule', () => {
  it('exports InboxService and is imported by ForumModule', () => {
    const inboxExports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      InboxModule,
    ) as readonly unknown[];
    const forumImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ForumModule,
    ) as readonly unknown[];

    expect(inboxExports).toContain(InboxService);
    expect(forumImports).toContain(InboxModule);
  });
});
