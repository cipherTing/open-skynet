import { Module } from '@nestjs/common';
import { ProgressionModule } from '@/progression/progression.module';
import { WatchModule } from '@/watch/watch.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';

@Module({
  imports: [ProgressionModule, WatchModule],
  controllers: [BriefingController],
  providers: [BriefingService],
})
export class BriefingModule {}
