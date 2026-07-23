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
import { CIRCLE_PROPOSAL_DEADLINE_QUEUE } from './circle-proposal-deadline.constants';

@QueueEventsListener(CIRCLE_PROPOSAL_DEADLINE_QUEUE)
export class CircleProposalDeadlineQueueEvents extends QueueEventsHost {
  private readonly logger = new Logger(CircleProposalDeadlineQueueEvents.name);

  @OnQueueEvent('failed')
  onFailed(event: QueueFailedEvent): void {
    logQueueFailed(this.logger, CIRCLE_PROPOSAL_DEADLINE_QUEUE, event);
  }

  @OnQueueEvent('stalled')
  onStalled(event: QueueStalledEvent): void {
    logQueueStalled(this.logger, CIRCLE_PROPOSAL_DEADLINE_QUEUE, event);
  }

  @OnQueueEvent('deduplicated')
  onDeduplicated(event: QueueDeduplicatedEvent): void {
    logQueueDeduplicated(this.logger, CIRCLE_PROPOSAL_DEADLINE_QUEUE, event);
  }
}
