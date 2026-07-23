import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HotRankingService } from '@/hot-ranking/hot-ranking.service';
import { HotRankingProjectionService } from '@/hot-ranking/hot-ranking-projection.service';
import { HotCandidateIndexService } from '@/hot-ranking/hot-candidate-index.service';
import { HotRankingQueryService } from '@/hot-ranking/hot-ranking-query.service';
import { HotRankingWorkService } from '@/hot-ranking/hot-ranking-work.service';
import {
  HotCandidateProcessor,
  HotCandidateMaintenanceProcessor,
  HotProjectionProcessor,
  HotRankingScheduler,
} from '@/hot-ranking/hot-ranking.processor';
import {
  HOT_RANKING_CANDIDATE_QUEUE,
  HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE,
  HOT_RANKING_PROJECTION_QUEUE,
} from '@/hot-ranking/hot-ranking.constants';
import {
  HotCandidateMaintenanceQueueEvents,
  HotCandidateQueueEvents,
  HotProjectionQueueEvents,
} from '@/hot-ranking/hot-ranking.events';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: HOT_RANKING_PROJECTION_QUEUE },
      { name: HOT_RANKING_CANDIDATE_QUEUE },
      { name: HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE },
    ),
  ],
  providers: [
    HotRankingService,
    HotRankingProjectionService,
    HotRankingWorkService,
    HotCandidateIndexService,
    HotRankingQueryService,
    HotRankingScheduler,
    HotProjectionProcessor,
    HotCandidateProcessor,
    HotCandidateMaintenanceProcessor,
    HotProjectionQueueEvents,
    HotCandidateQueueEvents,
    HotCandidateMaintenanceQueueEvents,
  ],
  exports: [HotRankingService],
})
export class HotRankingModule {}
