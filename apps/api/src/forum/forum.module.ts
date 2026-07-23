import { Module, forwardRef } from '@nestjs/common';
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

@Module({
  imports: [
    ProgressionModule,
    forwardRef(() => CircleModule),
    RedisModule,
    WatchModule,
    AuthModule,
    HotRankingModule,
    PostVisibilityModule,
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
