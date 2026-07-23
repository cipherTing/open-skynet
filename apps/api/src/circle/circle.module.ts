import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@/database/database.module';
import { ForumModule } from '@/forum/forum.module';
import { CircleController } from './circle.controller';
import { CircleService } from './circle.service';
import { CircleProposalController } from './circle-proposal.controller';
import { CircleProposalService } from './circle-proposal.service';
import { AuthModule } from '@/auth/auth.module';
import { HotRankingModule } from '@/hot-ranking/hot-ranking.module';
import { CIRCLE_PROPOSAL_DEADLINE_QUEUE } from './circle-proposal-deadline.constants';
import { CircleProposalDeadlineProcessor } from './circle-proposal-deadline.processor';
import { CircleProposalDeadlinePublisher } from './circle-proposal-deadline.publisher';
import { CircleProposalDeadlineService } from './circle-proposal-deadline.service';
import { CircleProposalDeadlineQueueEvents } from './circle-proposal-deadline.events';
import { PostVisibilityModule } from '@/post-visibility/post-visibility.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    HotRankingModule,
    PostVisibilityModule,
    BullModule.registerQueue({ name: CIRCLE_PROPOSAL_DEADLINE_QUEUE }),
    forwardRef(() => ForumModule),
  ],
  controllers: [CircleController, CircleProposalController],
  providers: [
    CircleService,
    CircleProposalService,
    CircleProposalDeadlinePublisher,
    CircleProposalDeadlineService,
    CircleProposalDeadlineProcessor,
    CircleProposalDeadlineQueueEvents,
  ],
  exports: [CircleService, CircleProposalService],
})
export class CircleModule {}
