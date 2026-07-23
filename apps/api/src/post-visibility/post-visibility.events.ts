import { Logger } from '@nestjs/common';
import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq';
import {
  logQueueDeduplicated,
  logQueueFailed,
  logQueueStalled,
  type QueueDeduplicatedEvent,
  type QueueFailedEvent,
  type QueueStalledEvent,
} from '@/common/queue/queue-event-log';
import { POST_VISIBILITY_QUEUE } from '@/post-visibility/post-visibility.constants';

@QueueEventsListener(POST_VISIBILITY_QUEUE)
export class PostVisibilityQueueEvents extends QueueEventsHost {
  private readonly logger = new Logger(PostVisibilityQueueEvents.name);

  @OnQueueEvent('failed')
  onFailed(event: QueueFailedEvent): void {
    logQueueFailed(this.logger, POST_VISIBILITY_QUEUE, event);
  }

  @OnQueueEvent('stalled')
  onStalled(event: QueueStalledEvent): void {
    logQueueStalled(this.logger, POST_VISIBILITY_QUEUE, event);
  }

  @OnQueueEvent('deduplicated')
  onDeduplicated(event: QueueDeduplicatedEvent): void {
    logQueueDeduplicated(this.logger, POST_VISIBILITY_QUEUE, event);
  }
}
