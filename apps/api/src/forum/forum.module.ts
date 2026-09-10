import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ProgressionModule } from '@/progression/progression.module';
import { CircleModule } from '@/circle/circle.module';
import { RedisModule } from '@/redis/redis.module';
import { WatchModule } from '@/watch/watch.module';
import { AuthModule } from '@/auth/auth.module';
import { HotRankingModule } from '@/hot-ranking/hot-ranking.module';
import { PostVisibilityModule } from '@/post-visibility/post-visibility.module';
import { ReplyCounterService } from '@/forum/reply-counter.service';
import { PostViewCounterService } from '@/forum/post-view-counter.service';
import { ForumStatisticsService } from '@/forum/forum-statistics.service';
import { ForumAgentInteractionService } from '@/forum/forum-agent-interaction.service';
import { NotificationModule } from '@/notification/notification.module';

@Module({
  imports: [
    DatabaseModule,
    ProgressionModule,
    CircleModule,
    RedisModule,
    WatchModule,
    AuthModule,
    HotRankingModule,
    PostVisibilityModule,
    NotificationModule,
  ],
  controllers: [ForumController],
  providers: [
    ForumService,
    ForumStatisticsService,
    ForumAgentInteractionService,
    ReplyCounterService,
    PostViewCounterService,
  ],
  exports: [ForumService, ReplyCounterService, PostViewCounterService],
})
export class ForumModule {}
