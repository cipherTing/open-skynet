'use client';

import { AlertTriangle, CheckCircle2, CircleDot, RotateCcw, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GovernanceTimelineEvent } from '@skynet/shared';
import {
  formatGovernanceDateTime,
  formatGovernanceDuration,
  getGovernanceResultKey,
} from './governance-format';
import { GovernanceVoteCompare } from './GovernanceTerminal';

interface GovernanceTimelineProps {
  events: GovernanceTimelineEvent[];
}

type TimelineTone = 'accent' | 'info' | 'danger';

const TONE_DOT_CLASS: Record<TimelineTone, string> = {
  accent: 'border-border-accent bg-accent-muted text-accent',
  info: 'border-info/30 bg-info/10 text-info',
  danger: 'border-danger/30 bg-danger/10 text-danger',
};

function TimelineEvent({
  tone,
  icon,
  isLast,
  children,
}: {
  tone: TimelineTone;
  icon: React.ReactNode;
  isLast: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
      {isLast ? null : (
        <span className="absolute bottom-[-13px] left-[13px] top-7 w-px bg-border-strong" />
      )}
      <span
        className={`z-[1] flex h-7 w-7 items-center justify-center border ${TONE_DOT_CLASS[tone]}`}
      >
        {icon}
      </span>
      <div className="border border-border-subtle bg-surface-3 p-3">{children}</div>
    </li>
  );
}

function TimelineDate({ value }: { value: string }) {
  return <p className="mb-1 font-mono text-[11px] tabular-nums text-accent-dim">{value}</p>;
}

export function GovernanceTimeline({ events }: GovernanceTimelineProps) {
  const { t, i18n } = useTranslation();
  if (events.length === 0) {
    return (
      <p className="font-mono text-sm text-text-tertiary">{t('governance.detail.loadingDetail')}</p>
    );
  }

  return (
    <ol className="grid gap-3" aria-label={t('governance.detail.timeline')}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        if (event.type === 'CASE_OPENED') {
          return (
            <TimelineEvent
              key={`${event.type}-${event.occurredAt}-${index}`}
              tone="accent"
              icon={<CircleDot className="h-3.5 w-3.5" />}
              isLast={isLast}
            >
              <TimelineDate value={event.date} />
              <h4 className="text-[13px] font-bold text-text-primary">
                {t('governance.timeline.caseOpened')}
              </h4>
              <p className="text-xs text-text-secondary">
                {formatGovernanceDateTime(event.occurredAt, i18n.language)}
              </p>
            </TimelineEvent>
          );
        }
        if (event.type === 'VOTES_CAST') {
          return (
            <TimelineEvent
              key={`${event.type}-${event.date}-${index}`}
              tone="info"
              icon={<Users className="h-3.5 w-3.5" />}
              isLast={isLast}
            >
              <TimelineDate value={event.date} />
              <h4 className="text-[13px] font-bold text-text-primary">
                {t('governance.timeline.votesCast', { count: event.voterCount })}
              </h4>
              <GovernanceVoteCompare
                className="mt-2"
                violation={event.violation.votes}
                notViolation={event.notViolation.votes}
                violationLabel={t('governance.metrics.violationVotes')}
                notViolationLabel={t('governance.metrics.notViolationVotes')}
              />
              <p className="mt-2 font-mono text-[10px] tabular-nums text-text-tertiary">
                {t('governance.timeline.voterCount', { count: event.violation.voterCount })} /{' '}
                {t('governance.timeline.voterCount', { count: event.notViolation.voterCount })}
              </p>
            </TimelineEvent>
          );
        }
        if (event.type === 'ADMIN_CORRECTION') {
          return (
            <TimelineEvent
              key={`${event.type}-${event.occurredAt}-${index}`}
              tone="accent"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              isLast={isLast}
            >
              <TimelineDate value={event.date} />
              <h4 className="text-[13px] font-bold text-text-primary">
                {t('governance.timeline.adminCorrection')}
              </h4>
              <p className="text-xs text-text-secondary">{event.publicReason}</p>
            </TimelineEvent>
          );
        }
        return (
          <TimelineEvent
            key={`${event.type}-${event.occurredAt}-${index}`}
            tone={event.result === 'violation' ? 'danger' : 'accent'}
            icon={
              event.result === 'violation' ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )
            }
            isLast={isLast}
          >
            <TimelineDate value={event.date} />
            <h4 className="text-[13px] font-bold text-text-primary">
              {t('governance.timeline.caseResolved')}
            </h4>
            <p className="text-xs text-text-secondary">
              {t(`governance.results.${getGovernanceResultKey(event.result)}`)} ·{' '}
              {formatGovernanceDuration(event.durationMinutes, '—', t)}
            </p>
          </TimelineEvent>
        );
      })}
    </ol>
  );
}
