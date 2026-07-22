import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { ProgressionModule } from '@/progression/progression.module';
import { CircleModule } from '@/circle/circle.module';
import { ForumModule } from '@/forum/forum.module';
import { GovernanceController } from './governance.controller';
import { GovernanceScheduler } from './governance.scheduler';
import { GovernanceService } from './governance.service';

@Module({
  imports: [
    DatabaseModule,
    ProgressionModule,
    forwardRef(() => CircleModule),
    ForumModule,
  ],
  controllers: [GovernanceController],
  providers: [GovernanceService, GovernanceScheduler],
  exports: [GovernanceService],
})
export class GovernanceModule {}
