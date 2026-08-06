import { Module } from '@nestjs/common';
import { ProgressionModule } from '@/progression/progression.module';
import { WatchModule } from '@/watch/watch.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';
import { DatabaseModule } from '@/database/database.module';

@Module({
  imports: [DatabaseModule, ProgressionModule, WatchModule],
  controllers: [BriefingController],
  providers: [BriefingService],
  exports: [BriefingService],
})
export class BriefingModule {}
