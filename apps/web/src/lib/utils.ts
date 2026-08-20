import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getCurrentLanguage } from '@/i18n/i18n';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
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
