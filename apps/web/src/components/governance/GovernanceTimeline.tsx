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

/** 节点 = 1px 直角边框方块（无填充），色调仅由边框/图标承担。 */
const TONE_NODE_CLASS: Record<TimelineTone, string> = {
  accent: 'border-[#ADFF2F]/60 text-[#ADFF2F]',
  info: 'border-[#3A5A3A] text-[#EDF3ED]/70',
  danger: 'border-[#EF4444]/60 text-[#EF4444]/90',
};

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

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
    <li className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3">
      {isLast ? null : (
        <span aria-hidden className="absolute bottom-[-13px] left-[11px] top-6 w-px bg-[#1A2E1A]" />
      )}
      <span
        className={joinClasses(
          'z-[1] mt-0.5 flex h-6 w-6 items-center justify-center border bg-black',
          TONE_NODE_CLASS[tone],
        )}
      >
        {icon}
      </span>
      <div className={isLast ? 'pb-1' : 'border-b border-[#122012] pb-3'}>{children}</div>
    </li>
  );
}

function TimelineDate({ value }: { value: string }) {
  return (
    <p className="mb-1 font-mono text-[10px] tabular-nums tracking-[0.15em] text-[#3A5A3A]">
      {value}
    </p>
  );
}

export function GovernanceTimeline({ events }: GovernanceTimelineProps) {
  const { t, i18n } = useTranslation();
  if (events.length === 0) {
    return (
      <p className="font-mono text-sm text-[#3A5A3A]">{t('governance.detail.loadingDetail')}</p>
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
              <h4 className="text-[13px] font-bold text-white/90">
                {t('governance.timeline.caseOpened')}
              </h4>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#EDF3ED]/60">
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
              <h4 className="text-[13px] font-bold text-white/90">
                {t('governance.timeline.votesCast', { count: event.voterCount })}
              </h4>
              <GovernanceVoteCompare
                className="mt-2"
                violation={event.violation.votes}
                notViolation={event.notViolation.votes}
                violationLabel={t('governance.metrics.violationVotes')}
                notViolationLabel={t('governance.metrics.notViolationVotes')}
              />
              <p className="mt-2 font-mono text-[10px] tabular-nums tracking-[0.12em] text-[#3A5A3A]">
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
              <h4 className="text-[13px] font-bold text-white/90">
                {t('governance.timeline.adminCorrection')}
              </h4>
              <p className="mt-0.5 text-xs leading-relaxed text-[#EDF3ED]/60">{event.publicReason}</p>
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
            <h4 className="text-[13px] font-bold text-white/90">
              {t('governance.timeline.caseResolved')}
            </h4>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#EDF3ED]/60">
              {t(`governance.results.${getGovernanceResultKey(event.result)}`)} ·{' '}
              {formatGovernanceDuration(event.durationMinutes, '—', t)}
            </p>
          </TimelineEvent>
        );
      })}
    </ol>
  );
}
