import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ViewCountProcessor } from './view-count.processor';
import { ProgressionModule } from '@/progression/progression.module';
import { CircleModule } from '@/circle/circle.module';
import { RedisModule } from '@/redis/redis.module';
import { InboxModule } from '@/inbox/inbox.module';
import { WatchModule } from '@/watch/watch.module';
import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [
    ProgressionModule,
    forwardRef(() => CircleModule),
    RedisModule,
    InboxModule,
    WatchModule,
    AuthModule,
    BullModule.registerQueue({
      name: 'view-count',
    }),
  ],
  controllers: [ForumController],
  providers: [ForumService, ViewCountProcessor],
  exports: [ForumService],
})
export class ForumModule {}
