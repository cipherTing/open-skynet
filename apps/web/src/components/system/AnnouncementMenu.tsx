'use client';

import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, Bell, Info, ShieldAlert, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { systemApi, type ActiveAnnouncement } from '@/lib/api';

const READ_ANNOUNCEMENTS_PREFIX = 'skynet-read-announcements';
const READ_ANNOUNCEMENTS_EVENT = 'skynet:announcements-read';
const memoryReadVersions = new Map<string, string[]>();

const KIND_ICON: Record<ActiveAnnouncement['kind'], typeof Info> = {
  INFO: Info,
  MAINTENANCE: Wrench,
  SECURITY: ShieldAlert,
  INCIDENT: AlertTriangle,
};

function announcementVersion(item: ActiveAnnouncement): string {
  return `${item.id}:${item.updatedAt}`;
}

function storageKey(viewerKey: string): string {
  return `${READ_ANNOUNCEMENTS_PREFIX}:${viewerKey}`;
}

function parseReadVersions(snapshot: string): string[] {
  try {
    const value: unknown = JSON.parse(snapshot);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(-200)
      : [];
  } catch {
    return [];
  }
}

function subscribeToReadAnnouncements(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(READ_ANNOUNCEMENTS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(READ_ANNOUNCEMENTS_EVENT, onStoreChange);
  };
}

function readSnapshot(viewerKey: string): string {
  const memoryVersions = memoryReadVersions.get(viewerKey) ?? [];
  try {
    const storedVersions = parseReadVersions(localStorage.getItem(storageKey(viewerKey)) ?? '[]');
    return JSON.stringify([...new Set([...storedVersions, ...memoryVersions])]);
  } catch {
    return JSON.stringify(memoryVersions);
  }
}

export function AnnouncementMenu() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const viewerKey = user?.id ?? 'anonymous';
  const readVersionsSnapshot = useSyncExternalStore(
    subscribeToReadAnnouncements,
    () => readSnapshot(viewerKey),
    () => '[]',
  );
  const readVersions = useMemo(
    () => new Set(parseReadVersions(readVersionsSnapshot)),
    [readVersionsSnapshot],
  );
  const query = useQuery({
    queryKey: ['system', 'activeAnnouncements'],
    queryFn: systemApi.activeAnnouncements,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const announcements = useMemo(() => query.data ?? [], [query.data]);
  const unreadCount = announcements.filter(
    (item) => !readVersions.has(announcementVersion(item)),
  ).length;
  const isChinese = i18n.resolvedLanguage?.startsWith('zh') ?? false;
  const buttonLabel = unreadCount > 0
    ? t('announcement.buttonUnread', { count: unreadCount })
    : t('announcement.button');

  const markCurrentAnnouncementsRead = useCallback(() => {
    if (announcements.length === 0) return;
    const latestReadVersions = parseReadVersions(readSnapshot(viewerKey));
    const next = [
      ...new Set([
        ...latestReadVersions,
        ...announcements.map(announcementVersion),
      ]),
    ].slice(-200);
    memoryReadVersions.set(viewerKey, next);
    try {
      localStorage.setItem(storageKey(viewerKey), JSON.stringify(next));
    } catch {
      // The module-level store keeps this tab consistent when storage is blocked.
    }
    window.dispatchEvent(new Event(READ_ANNOUNCEMENTS_EVENT));
  }, [announcements, viewerKey]);

  useEffect(() => {
    if (open) markCurrentAnnouncementsRead();
  }, [markCurrentAnnouncementsRead, open]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) markCurrentAnnouncementsRead();
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={buttonLabel}
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle text-ink-muted transition-colors hover:border-border-accent hover:text-copper"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ochre ring-2 ring-void" aria-hidden="true" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-labelledby={titleId}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="skynet-floating-content z-[220] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-md border border-border-default bg-void-deep shadow-[var(--shadow-popover)]"
        >
          <div className="border-b border-border-subtle px-4 py-3">
            <h2 id={titleId} className="text-sm font-bold text-ink-primary">{t('announcement.menuTitle')}</h2>
          </div>
          <div className="max-h-[min(420px,calc(100dvh-96px))] overflow-y-auto p-1.5">
            {query.isPending ? (
              <div className="px-3 py-8 text-center text-xs text-ink-muted">
                {t('announcement.loading')}
              </div>
            ) : query.isError ? (
              <div className="flex flex-col items-center gap-3 px-3 py-8 text-center text-xs text-ochre">
                <span>{t('announcement.failed')}</span>
                <button
                  type="button"
                  onClick={() => void query.refetch()}
                  className="rounded-md border border-ochre/30 px-3 py-1.5 text-ink-secondary hover:text-ochre"
                >
                  {t('announcement.retry')}
                </button>
              </div>
            ) : announcements.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-ink-muted">
                {t('announcement.empty')}
              </div>
            ) : (
              announcements.map((item) => {
                const Icon = KIND_ICON[item.kind];
                const title = isChinese ? item.titleZh : item.titleEn;
                const body = isChinese ? item.bodyZh : item.bodyEn;
                const content = (
                  <div className="flex gap-3 rounded px-2.5 py-3 transition-colors hover:bg-surface-1">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-copper" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-ink-primary">{title}</div>
                      <div className="mt-1 line-clamp-3 text-xs leading-5 text-ink-secondary">{body}</div>
                    </div>
                  </div>
                );
                if (!item.linkUrl) return <div key={item.id}>{content}</div>;
                return item.linkUrl.startsWith('/') ? (
                  <Link key={item.id} href={item.linkUrl} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <a key={item.id} href={item.linkUrl} target="_blank" rel="noreferrer noopener">
                    {content}
                  </a>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
