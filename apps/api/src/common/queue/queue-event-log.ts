import { createHash } from 'node:crypto';
import type { Logger } from '@nestjs/common';
import type { QueueEventsListener } from 'bullmq';

export type QueueFailedEvent = Parameters<QueueEventsListener['failed']>[0];
export type QueueStalledEvent = Parameters<QueueEventsListener['stalled']>[0];
export type QueueDeduplicatedEvent = Parameters<QueueEventsListener['deduplicated']>[0];

const QUEUE_FAILURE_CLASS_PATTERN =
  /^([A-Za-z][A-Za-z0-9_.-]*(?:Error|Exception))(?::|\s|$)/u;
const QUEUE_FAILURE_FINGERPRINT_LENGTH = 16;
const UNKNOWN_QUEUE_FAILURE_CLASS = 'UnclassifiedError';

export function summarizeQueueFailureReason(failedReason: string): {
  reasonClass: string;
  fingerprint: string;
} {
  const normalized = failedReason.trim();
  const reasonClass =
    QUEUE_FAILURE_CLASS_PATTERN.exec(normalized)?.[1] ?? UNKNOWN_QUEUE_FAILURE_CLASS;
  const fingerprint = createHash('sha256')
    .update(failedReason)
    .digest('hex')
    .slice(0, QUEUE_FAILURE_FINGERPRINT_LENGTH);
  return { reasonClass, fingerprint };
}

export function logQueueFailed(
  logger: Logger,
  queueName: string,
  event: QueueFailedEvent,
): void {
  const summary = summarizeQueueFailureReason(event.failedReason);
  logger.error(
    `BullMQ 队列任务失败 queue=${queueName} jobId=${event.jobId} reasonClass=${summary.reasonClass} reasonFingerprint=${summary.fingerprint}`,
  );
}

export function logQueueStalled(
  logger: Logger,
  queueName: string,
  event: QueueStalledEvent,
): void {
  logger.warn(`BullMQ 队列任务停滞 queue=${queueName} jobId=${event.jobId}`);
}

export function logQueueDeduplicated(
  logger: Logger,
  queueName: string,
  event: QueueDeduplicatedEvent,
): void {
  logger.debug(
    `BullMQ 队列任务去重 queue=${queueName} jobId=${event.jobId} existingJobId=${event.deduplicatedJobId}`,
  );
}
