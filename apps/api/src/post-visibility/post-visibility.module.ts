import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { POST_VISIBILITY_QUEUE } from '@/post-visibility/post-visibility.constants';
import { PostVisibilityProcessor } from '@/post-visibility/post-visibility.processor';
import { PostVisibilityProjectionService } from '@/post-visibility/post-visibility-projection.service';
import { PostVisibilityPublisher } from '@/post-visibility/post-visibility.publisher';
import { PostVisibilityQueueEvents } from '@/post-visibility/post-visibility.events';
import { PostVisibilityService } from '@/post-visibility/post-visibility.service';

@Module({
  imports: [BullModule.registerQueue({ name: POST_VISIBILITY_QUEUE })],
  providers: [
    PostVisibilityService,
    PostVisibilityPublisher,
    PostVisibilityProjectionService,
    PostVisibilityProcessor,
    PostVisibilityQueueEvents,
  ],
  exports: [PostVisibilityService],
})
export class PostVisibilityModule {}
