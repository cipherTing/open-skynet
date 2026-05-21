'use client';

import { AlertTriangle, CheckCircle2, CircleDot, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GovernanceTimelineEvent } from '@skynet/shared';
import { formatGovernanceDateTime, formatGovernanceDuration, getGovernanceResultKey } from './governance-format';

interface GovernanceTimelineProps {
  events: GovernanceTimelineEvent[];
}

function formatTally(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export function GovernanceTimeline({ events }: GovernanceTimelineProps) {
  const { t, i18n } = useTranslation();
  if (events.length === 0) {
    return <p className="text-sm text-ink-muted">{t('governance.detail.loadingDetail')}</p>;
  }

  return (
    <ol className="governance-timeline" aria-label={t('governance.detail.timeline')}>
      {events.map((event, index) => {
        if (event.type === 'CASE_OPENED') {
          return (
            <li key={`${event.type}-${event.occurredAt}-${index}`} className="governance-timeline__event governance-timeline__event--opened">
              <span className="governance-timeline__rail" />
              <span className="governance-timeline__dot"><CircleDot className="h-3.5 w-3.5" /></span>
              <div className="governance-timeline__body">
                <p className="governance-timeline__date">{event.date}</p>
                <h4>{t('governance.timeline.caseOpened')}</h4>
                <p>{formatGovernanceDateTime(event.occurredAt, i18n.language)}</p>
              </div>
            </li>
          );
        }
        if (event.type === 'VOTES_CAST') {
          return (
            <li key={`${event.type}-${event.date}-${index}`} className="governance-timeline__event governance-timeline__event--votes">
              <span className="governance-timeline__rail" />
              <span className="governance-timeline__dot"><Users className="h-3.5 w-3.5" /></span>
              <div className="governance-timeline__body governance-timeline__body--votes">
                <p className="governance-timeline__date">{event.date}</p>
                <h4>{t('governance.timeline.votesCast', { count: event.voterCount })}</h4>
                <div className="governance-timeline__vote-row">
                  <span className="text-ochre">{t('governance.metrics.violationVotes')} {formatTally(event.violation.votes)}</span>
                  <span>{t('governance.timeline.voterCount', { count: event.violation.voterCount })}</span>
                </div>
                <div className="governance-timeline__vote-row">
                  <span className="text-moss">{t('governance.metrics.notViolationVotes')} {formatTally(event.notViolation.votes)}</span>
                  <span>{t('governance.timeline.voterCount', { count: event.notViolation.voterCount })}</span>
                </div>
              </div>
            </li>
          );
        }
        return (
          <li key={`${event.type}-${event.occurredAt}-${index}`} className={`governance-timeline__event ${event.result === 'violation' ? 'governance-timeline__event--violation' : 'governance-timeline__event--not-violation'}`}>
            <span className="governance-timeline__rail" />
            <span className="governance-timeline__dot">
              {event.result === 'violation' ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </span>
            <div className="governance-timeline__body">
              <p className="governance-timeline__date">{event.date}</p>
              <h4>{t('governance.timeline.caseResolved')}</h4>
              <p>{t(`governance.results.${getGovernanceResultKey(event.result)}`)} · {formatGovernanceDuration(event.durationMinutes, '—', t)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
