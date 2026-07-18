'use client';

import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, Bell, Info, ShieldAlert, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { systemApi, type ActiveAnnouncement } from '@/lib/api';
import { TButton } from '@/components/ui/terminal';
import { AnnouncementMarkdown } from './AnnouncementMarkdown';

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
  const { t } = useTranslation();
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
  const buttonLabel =
    unreadCount > 0
      ? t('announcement.buttonUnread', { count: unreadCount })
      : t('announcement.button');

  const markCurrentAnnouncementsRead = useCallback(() => {
    if (announcements.length === 0) return;
    const latestReadVersions = parseReadVersions(readSnapshot(viewerKey));
    const next = [
      ...new Set([...latestReadVersions, ...announcements.map(announcementVersion)]),
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
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[var(--t-noise)] text-[var(--t-sub)] transition-[color,border-color] duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 bg-[var(--t-hazard)]" aria-hidden="true" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-labelledby={titleId}
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-none border border-[var(--t-noise)] bg-black"
        >
          <div className="border-b border-[var(--t-noise)] px-4 py-3">
            <h2 id={titleId} className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-white">
              {t('announcement.menuTitle')}
            </h2>
          </div>
          <div className="max-h-[min(420px,calc(100dvh-96px))] overflow-y-auto">
            {query.isPending ? (
              <div className="px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('announcement.loading')}
              </div>
            ) : query.isError ? (
              <div className="flex flex-col items-center gap-3 px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-hazard)]">
                <span>{t('announcement.failed')}</span>
                <TButton
                  variant="secondary"
                  size="sm"
                  onClick={() => void query.refetch()}
                >
                  {t('announcement.retry')}
                </TButton>
              </div>
            ) : announcements.length === 0 ? (
              <div className="px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('announcement.empty')}
              </div>
            ) : (
              announcements.map((item) => {
                const Icon = KIND_ICON[item.kind];
                const content = (
                  <div className="flex gap-3 px-2.5 py-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t-accent)]" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white">{item.title}</div>
                      <AnnouncementMarkdown
                        content={item.body}
                        className="mt-1 text-xs leading-5 text-white/70"
                      />
                      <div className="mt-2 font-mono text-[10px] tabular-nums tracking-[0.15em] text-[var(--t-faint)]">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(item.startsAt))}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <div
                    key={item.id}
                    className="border-b border-[var(--t-noise)] transition-colors [transition-timing-function:steps(2,end)] last:border-b-0 hover:bg-[var(--t-accent-wash)]"
                  >
                    {content}
                    {item.linkUrl && (
                      <div className="px-2.5 pb-3 pl-9">
                        {item.linkUrl.startsWith('/') ? (
                          <Link
                            href={item.linkUrl}
                            onClick={() => setOpen(false)}
                            className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--t-accent)] hover:text-white"
                          >
                            {t('announcement.open')}
                          </Link>
                        ) : (
                          <a
                            href={item.linkUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--t-accent)] hover:text-white"
                          >
                            {t('announcement.open')}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
