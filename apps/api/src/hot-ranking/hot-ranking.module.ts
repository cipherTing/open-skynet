import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HOT_RANKING_QUEUE, HotRankingProcessor, HotRankingService } from './hot-ranking.service';

@Module({
  imports: [BullModule.registerQueue({ name: HOT_RANKING_QUEUE })],
  providers: [HotRankingService, HotRankingProcessor],
  exports: [HotRankingService],
})
export class HotRankingModule {}
