import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@/database/database.module';
import { ProgressionModule } from '@/progression/progression.module';
import { CircleModule } from '@/circle/circle.module';
import { ForumModule } from '@/forum/forum.module';
import { HotRankingModule } from '@/hot-ranking/hot-ranking.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { GOVERNANCE_DEADLINE_QUEUE } from './governance-deadline.constants';
import { GovernanceDeadlinePublisher } from './governance-deadline.publisher';
import { GovernanceDeadlineService } from './governance-deadline.service';
import { GovernanceDeadlineProcessor } from './governance-deadline.processor';
import { GovernanceDeadlineQueueEvents } from './governance-deadline.events';

@Module({
  imports: [
    BullModule.registerQueue({ name: GOVERNANCE_DEADLINE_QUEUE }),
    DatabaseModule,
    ProgressionModule,
    forwardRef(() => CircleModule),
    ForumModule,
    HotRankingModule,
  ],
  controllers: [GovernanceController],
  providers: [
    GovernanceService,
    GovernanceDeadlinePublisher,
    GovernanceDeadlineService,
    GovernanceDeadlineProcessor,
    GovernanceDeadlineQueueEvents,
  ],
  exports: [GovernanceService],
})
export class GovernanceModule {}
