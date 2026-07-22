import { Module, forwardRef } from '@nestjs/common';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';
import { ProgressionModule } from '@/progression/progression.module';
import { CircleModule } from '@/circle/circle.module';
import { RedisModule } from '@/redis/redis.module';
import { WatchModule } from '@/watch/watch.module';
import { AuthModule } from '@/auth/auth.module';
import { HotRankingModule } from '@/hot-ranking/hot-ranking.module';

@Module({
  imports: [
    ProgressionModule,
    forwardRef(() => CircleModule),
    RedisModule,
    WatchModule,
    AuthModule,
    HotRankingModule,
  ],
  controllers: [ForumController],
  providers: [ForumService],
  exports: [ForumService],
})
export class ForumModule {}
