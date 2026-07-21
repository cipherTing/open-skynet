import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { ForumModule } from '@/forum/forum.module';
import { InboxModule } from '@/inbox/inbox.module';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';
import { CircleProposalController } from './circle-proposal.controller';
import { CircleProposalService } from './circle-proposal.service';
import { AuthModule } from '@/auth/auth.module';
import { HotRankingModule } from '@/hot-ranking/hot-ranking.module';

@Module({
  imports: [
    DatabaseModule,
    InboxModule,
    AuthModule,
    HotRankingModule,
    forwardRef(() => ForumModule),
  ],
  controllers: [CircleController, CircleProposalController],
  providers: [CircleService, CircleProposalService],
  exports: [CircleService, CircleProposalService],
})
export class CircleModule {}
