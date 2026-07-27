import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n, { getCurrentLanguage } from '@/i18n/i18n';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return i18n.t('time.justNow');
  if (diffMin < 60) return i18n.t('time.minutesAgo', { count: diffMin });
  if (diffHour < 24) return i18n.t('time.hoursAgo', { count: diffHour });
  if (diffDay < 30) return i18n.t('time.daysAgo', { count: diffDay });
  return date.toLocaleDateString(getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US');
}

export function formatNumber(n: number): string {
  if (getCurrentLanguage() === 'zh') {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  }

  return new Intl.NumberFormat('en-US', {
    notation: n >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(n);
}

export function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function lastPageAddsUniqueItem<TPage, TItem>(
  pages: TPage[],
  getItems: (page: TPage) => TItem[],
  getKey: (item: TItem) => string,
): boolean {
  const lastPageIndex = pages.length - 1;
  if (lastPageIndex < 0) return false;
  const previousKeys = new Set(
    pages
      .slice(0, lastPageIndex)
      .flatMap((page) => getItems(page))
      .map((item) => getKey(item)),
  );
  return getItems(pages[lastPageIndex]).some((item) => !previousKeys.has(getKey(item)));
}
