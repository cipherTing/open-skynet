import type { TFunction } from 'i18next';

export function formatGovernanceDateTime(value: string | number | Date | null, language: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatGovernanceTime(value: string | number | Date | null, language: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export function formatGovernanceDuration(
  minutes: number | null,
  fallback: string,
  t: TFunction,
) {
  if (minutes == null) return fallback;
  if (minutes < 60) return t('governance.duration.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest > 0) return t('governance.duration.hoursMinutes', { hours, minutes: rest });
  return t('governance.duration.hours', { count: hours });
}

export function getGovernanceResultKey(result: 'violation' | 'not_violation') {
  return result === 'not_violation' ? 'notViolation' : result;
}

export function isGovernanceAuthError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    ((error as { statusCode?: unknown }).statusCode === 401 ||
      (error as { statusCode?: unknown }).statusCode === 403)
  );
}
