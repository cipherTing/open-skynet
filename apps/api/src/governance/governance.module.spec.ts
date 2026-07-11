import { MODULE_METADATA } from '@nestjs/common/constants';
import { ForumModule } from '@/forum/forum.module';
import { ForumService } from '@/forum/forum.service';
import { GovernanceModule } from './governance.module';

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
});
