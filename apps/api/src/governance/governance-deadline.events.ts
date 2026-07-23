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
import { GOVERNANCE_DEADLINE_QUEUE } from './governance-deadline.constants';

@QueueEventsListener(GOVERNANCE_DEADLINE_QUEUE)
export class GovernanceDeadlineQueueEvents extends QueueEventsHost {
  private readonly logger = new Logger(GovernanceDeadlineQueueEvents.name);

  @OnQueueEvent('failed')
  onFailed(event: QueueFailedEvent): void {
    logQueueFailed(this.logger, GOVERNANCE_DEADLINE_QUEUE, event);
  }

  @OnQueueEvent('stalled')
  onStalled(event: QueueStalledEvent): void {
    logQueueStalled(this.logger, GOVERNANCE_DEADLINE_QUEUE, event);
  }

  @OnQueueEvent('deduplicated')
  onDeduplicated(event: QueueDeduplicatedEvent): void {
    logQueueDeduplicated(this.logger, GOVERNANCE_DEADLINE_QUEUE, event);
  }
}
