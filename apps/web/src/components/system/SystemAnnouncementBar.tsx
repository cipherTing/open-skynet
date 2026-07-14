'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Info, ShieldAlert, Wrench, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { systemApi, type ActiveAnnouncement } from '@/lib/api';
import { AnnouncementMarkdown } from './AnnouncementMarkdown';

const DISMISSED_ANNOUNCEMENTS_KEY = 'skynet-dismissed-announcements';
const DISMISSED_ANNOUNCEMENTS_EVENT = 'skynet:announcements-dismissed';

const KIND_STYLE: Record<
  ActiveAnnouncement['kind'],
  { icon: typeof Info; border: string; text: string }
> = {
  INFO: { icon: Info, border: 'border-copper/40', text: 'text-copper' },
  MAINTENANCE: { icon: Wrench, border: 'border-ochre/45', text: 'text-ochre' },
  SECURITY: { icon: ShieldAlert, border: 'border-ochre/60', text: 'text-ochre' },
  INCIDENT: { icon: AlertTriangle, border: 'border-ochre/70', text: 'text-ochre' },
};

function announcementDismissKey(item: ActiveAnnouncement): string {
  return `${item.id}:${item.updatedAt}`;
}

function readDismissedKeys(snapshot: string): string[] {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string').slice(-100)
      : [];
  } catch {
    return [];
  }
}

function subscribeToDismissedAnnouncements(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(DISMISSED_ANNOUNCEMENTS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(DISMISSED_ANNOUNCEMENTS_EVENT, onStoreChange);
  };
}

function getDismissedAnnouncementsSnapshot(): string {
  try {
    return localStorage.getItem(DISMISSED_ANNOUNCEMENTS_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function getDismissedAnnouncementsServerSnapshot(): string {
  return '[]';
}

export function SystemAnnouncementBar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [memoryDismissedKeys, setMemoryDismissedKeys] = useState<string[]>([]);
  const dismissedSnapshot = useSyncExternalStore(
    subscribeToDismissedAnnouncements,
    getDismissedAnnouncementsSnapshot,
    getDismissedAnnouncementsServerSnapshot,
  );
  const dismissedKeys = useMemo(
    () => [...new Set([...readDismissedKeys(dismissedSnapshot), ...memoryDismissedKeys])],
    [dismissedSnapshot, memoryDismissedKeys],
  );
  const query = useQuery({
    queryKey: ['system', 'activeAnnouncements'],
    queryFn: systemApi.activeAnnouncements,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const announcement = useMemo(
    () => query.data?.find((item) => !dismissedKeys.includes(announcementDismissKey(item))) ?? null,
    [dismissedKeys, query.data],
  );

  if (pathname.startsWith('/admin') || !announcement) return null;
  const style = KIND_STYLE[announcement.kind];
  const Icon = style.icon;

  const dismiss = () => {
    const next = [...new Set([...dismissedKeys, announcementDismissKey(announcement)])].slice(-100);
    setMemoryDismissedKeys(next);
    try {
      localStorage.setItem(DISMISSED_ANNOUNCEMENTS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(DISMISSED_ANNOUNCEMENTS_EVENT));
    } catch {
      // Memory state still dismisses the announcement for this tab.
    }
  };

  return (
    <div
      role="region"
      aria-label={t('announcement.region')}
      aria-live="polite"
      className={`relative z-30 flex-none border-b ${style.border} bg-void-deep/95 px-4 py-2.5 backdrop-blur-md`}
    >
      <div className="mx-auto flex max-w-[1600px] items-start gap-3 sm:items-center">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 sm:mt-0 ${style.text}`} />
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
          <div className="text-xs font-bold text-ink-primary">{announcement.title}</div>
          <div className="mt-1 max-h-10 overflow-hidden text-xs leading-5 text-ink-secondary sm:mt-0 sm:max-h-5">
            <AnnouncementMarkdown content={announcement.body} compact />
          </div>
        </div>
        {announcement.linkUrl && (
          announcement.linkUrl.startsWith('/') ? (
            <Link href={announcement.linkUrl} className={`shrink-0 text-xs font-bold ${style.text} hover:underline`}>
              {t('announcement.open')}
            </Link>
          ) : (
            <a href={announcement.linkUrl} target="_blank" rel="noreferrer noopener" className={`shrink-0 text-xs font-bold ${style.text} hover:underline`}>
              {t('announcement.open')}
            </a>
          )
        )}
        {announcement.dismissible && (
          <button type="button" onClick={dismiss} aria-label={t('announcement.dismiss')} className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-muted hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
