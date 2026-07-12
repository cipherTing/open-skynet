import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '@/app.module';
import { BriefingModule } from './briefing.module';

describe('BriefingModule', () => {
  it('is registered by AppModule', () => {
    const appImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as readonly unknown[];
    expect(appImports).toContain(BriefingModule);
  });
});
