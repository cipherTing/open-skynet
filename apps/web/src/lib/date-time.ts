export type TimestampValue = string | number | Date;

export interface ExactTimestampOptions {
  locale?: string;
  timeZone?: string;
}

const exactTimestampFormatters = new Map<string, Intl.DateTimeFormat>();

function getExactTimestampFormatter(options: ExactTimestampOptions): Intl.DateTimeFormat {
  const key = `${options.locale ?? ''}\u0000${options.timeZone ?? ''}`;
  const cached = exactTimestampFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(options.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: options.timeZone,
  });
  exactTimestampFormatters.set(key, formatter);
  return formatter;
}

export function parseTimestamp(value: TimestampValue): Date | null {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatLocalClockTime(value: Date): string {
  return [value.getHours(), value.getMinutes(), value.getSeconds()]
    .map((unit) => String(unit).padStart(2, '0'))
    .join(':');
}

export function formatExactTimestamp(
  value: TimestampValue,
  options: ExactTimestampOptions = {},
): string | null {
  const parsed = parseTimestamp(value);
  if (!parsed) return null;
  return getExactTimestampFormatter(options).format(parsed);
}
