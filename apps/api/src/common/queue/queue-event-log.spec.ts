import { Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CircleModule } from '@/circle/circle.module';
import { CircleProposalDeadlineQueueEvents } from '@/circle/circle-proposal-deadline.events';
import { GovernanceModule } from '@/governance/governance.module';
import { GovernanceDeadlineQueueEvents } from '@/governance/governance-deadline.events';
import {
  HotCandidateMaintenanceQueueEvents,
  HotCandidateQueueEvents,
  HotProjectionQueueEvents,
} from '@/hot-ranking/hot-ranking.events';
import { HotRankingModule } from '@/hot-ranking/hot-ranking.module';
import { summarizeQueueFailureReason } from './queue-event-log';

describe('BullMQ queue event diagnostics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reduces failed reasons to a safe class and fingerprint', () => {
    const sensitiveValue = 'sensitive-value-that-must-not-appear';
    const reason = `MongoServerError: {"password":"${sensitiveValue}"} redis://user:${sensitiveValue}@redis`;

    const summary = summarizeQueueFailureReason(reason);

    expect(summary).toEqual({
      reasonClass: 'MongoServerError',
      fingerprint: expect.stringMatching(/^[a-f0-9]{16}$/u),
    });
    expect(JSON.stringify(summary)).not.toContain(sensitiveValue);
  });

  it.each([
    ['热度投影', HotProjectionQueueEvents],
    ['热度候选', HotCandidateQueueEvents],
    ['热度维护', HotCandidateMaintenanceQueueEvents],
    ['治理截止', GovernanceDeadlineQueueEvents],
    ['共建截止', CircleProposalDeadlineQueueEvents],
  ] as const)('%s queue records failed, stalled and deduplicated without job data', (_label, Listener) => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const listener = new Listener();
    const sensitiveValue = 'queue-secret-value';

    listener.onFailed({
      jobId: 'failed-job',
      failedReason: `Error: {"password":"${sensitiveValue}"}`,
    });
    listener.onStalled({ jobId: 'stalled-job' });
    listener.onDeduplicated({
      jobId: 'new-job',
      deduplicationId: 'deduplication-key',
      deduplicatedJobId: 'existing-job',
    });

    const output = [...error.mock.calls, ...warn.mock.calls, ...debug.mock.calls].flat().join(' ');
    expect(output).not.toContain(sensitiveValue);
    expect(output).not.toContain('deduplication-key');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('jobId=failed-job'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('jobId=stalled-job'));
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('existingJobId=existing-job'));
  });

  it('registers all queue event listeners in their domain modules', () => {
    const hotProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      HotRankingModule,
    ) as readonly unknown[];
    const governanceProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      GovernanceModule,
    ) as readonly unknown[];
    const circleProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      CircleModule,
    ) as readonly unknown[];

    expect(hotProviders).toEqual(
      expect.arrayContaining([
        HotProjectionQueueEvents,
        HotCandidateQueueEvents,
        HotCandidateMaintenanceQueueEvents,
      ]),
    );
    expect(governanceProviders).toContain(GovernanceDeadlineQueueEvents);
    expect(circleProviders).toContain(CircleProposalDeadlineQueueEvents);
  });
});
