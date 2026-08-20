'use client';

import '@github/relative-time-element';
import { useTranslation } from 'react-i18next';
import { getCurrentLanguage } from '@/i18n/i18n';
import { languageToHtmlLang } from '@/i18n/resources';
import { useClientReady } from '@/hooks/useClientReady';
import {
  formatExactTimestamp,
  parseTimestamp,
  type TimestampValue,
} from '@/lib/date-time';
import { cn } from '@/lib/utils';

const TIMESTAMP_CLASS =
  'whitespace-nowrap font-mono text-[11px] tabular-nums tracking-[0.08em] text-[var(--t-faint)]';

export interface TimestampProps {
  date: TimestampValue;
  className?: string;
}

function useTimestampValue(date: TimestampValue) {
  const { i18n } = useTranslation();
  const clientReady = useClientReady();
  const parsed = parseTimestamp(date);
  if (!parsed) return null;
  const locale = languageToHtmlLang(getCurrentLanguage(i18n));
  const exact = formatExactTimestamp(parsed, {
    locale,
    timeZone: clientReady ? undefined : 'UTC',
  });
  if (!exact) return null;
  return { exact, iso: parsed.toISOString(), locale };
}

export function RelativeTime({ date, className }: TimestampProps) {
  const value = useTimestampValue(date);
  if (!value) return null;
  return (
    <relative-time
      datetime={value.iso}
      format="relative"
      threshold="P30D"
      precision="minute"
      prefix=""
      format-style="long"
      year="numeric"
      month="2-digit"
      day="2-digit"
      hour="2-digit"
      minute="2-digit"
      second="2-digit"
      lang={value.locale}
      title={value.exact}
      aria-label={value.exact}
      className={cn(TIMESTAMP_CLASS, className)}
    >
      {value.exact}
    </relative-time>
  );
}

export function ExactTime({ date, className }: TimestampProps) {
  const value = useTimestampValue(date);
  if (!value) return null;
  return (
    <time
      dateTime={value.iso}
      title={value.exact}
      aria-label={value.exact}
      className={cn(TIMESTAMP_CLASS, className)}
    >
      [{value.exact}]
    </time>
  );
}
