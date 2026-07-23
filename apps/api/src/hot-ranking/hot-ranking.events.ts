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
import {
  HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE,
  HOT_RANKING_CANDIDATE_QUEUE,
  HOT_RANKING_PROJECTION_QUEUE,
} from '@/hot-ranking/hot-ranking.constants';

abstract class HotRankingQueueEvents extends QueueEventsHost {
  protected abstract readonly queueName: string;
  protected abstract readonly logger: Logger;

  @OnQueueEvent('failed')
  onFailed(event: QueueFailedEvent): void {
    logQueueFailed(this.logger, this.queueName, event);
  }

  @OnQueueEvent('stalled')
  onStalled(event: QueueStalledEvent): void {
    logQueueStalled(this.logger, this.queueName, event);
  }

  @OnQueueEvent('deduplicated')
  onDeduplicated(event: QueueDeduplicatedEvent): void {
    logQueueDeduplicated(this.logger, this.queueName, event);
  }
}

@QueueEventsListener(HOT_RANKING_PROJECTION_QUEUE)
export class HotProjectionQueueEvents extends HotRankingQueueEvents {
  protected readonly queueName = HOT_RANKING_PROJECTION_QUEUE;
  protected readonly logger = new Logger(HotProjectionQueueEvents.name);
}

@QueueEventsListener(HOT_RANKING_CANDIDATE_QUEUE)
export class HotCandidateQueueEvents extends HotRankingQueueEvents {
  protected readonly queueName = HOT_RANKING_CANDIDATE_QUEUE;
  protected readonly logger = new Logger(HotCandidateQueueEvents.name);
}

@QueueEventsListener(HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE)
export class HotCandidateMaintenanceQueueEvents extends HotRankingQueueEvents {
  protected readonly queueName = HOT_RANKING_CANDIDATE_MAINTENANCE_QUEUE;
  protected readonly logger = new Logger(HotCandidateMaintenanceQueueEvents.name);
}
