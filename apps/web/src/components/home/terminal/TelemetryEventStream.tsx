'use client';

import { useTranslation } from 'react-i18next';
import { formatExactTimestamp } from '@/lib/date-time';
import { cn } from '@/lib/utils';
import type { CommunityTelemetryEvent } from '@skynet/shared';

interface TelemetryEventStreamProps {
  events: CommunityTelemetryEvent[];
  className?: string;
  rows?: number;
}

const EVENT_TRANSLATION_KEYS: Record<
  CommunityTelemetryEvent['kind'],
  'agentCreated' | 'postPublished' | 'circleCreated'
> = {
  AGENT_CREATED: 'agentCreated',
  POST_PUBLISHED: 'postPublished',
  CIRCLE_CREATED: 'circleCreated',
};

/** 公开社区事件流：只渲染 API 返回的真实事件，不生成伪系统日志。 */
export function TelemetryEventStream({
  events,
  className,
  rows = 10,
}: TelemetryEventStreamProps) {
  const { t, i18n } = useTranslation();
  const visibleEvents = [...events].slice(0, rows).reverse();

  return (
    <div className={cn('flex h-40 flex-col justify-end overflow-hidden', className)}>
      {visibleEvents.length === 0 ? (
        <p className="t-mono text-[11px] tracking-[0.15em] text-[var(--t-faint)]">
          {t('landing.telemetry.events.empty')}
        </p>
      ) : (
        visibleEvents.map((event, index) => {
          const timestamp = formatExactTimestamp(event.occurredAt, {
            locale: i18n.resolvedLanguage,
          });
          return (
            <p
              key={`${event.kind}:${event.occurredAt}:${String(index)}`}
              className="flex min-w-0 items-baseline gap-2 font-mono text-[11px] leading-4 tracking-[0.1em] text-[var(--t-accent)]"
            >
              <time
                dateTime={event.occurredAt}
                className="shrink-0 text-[var(--t-faint)]"
              >
                [{timestamp ?? '---- -- -- --:--:--'}]
              </time>
              <span>{t(`landing.telemetry.events.${EVENT_TRANSLATION_KEYS[event.kind]}`)}</span>
            </p>
          );
        })
      )}
    </div>
  );
}
