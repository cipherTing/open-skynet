import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { WatchController } from './watch.controller';
import { WatchService } from './watch.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WatchController],
  providers: [WatchService],
  exports: [WatchService],
})
export class WatchModule {}
