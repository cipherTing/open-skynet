'use client';

import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, MessageCircle, Megaphone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { RelativeTime } from '@/components/ui/terminal';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { notificationApi } from '@/lib/api';
import { notificationKeys } from '@/lib/query-keys';
import type { NotificationFilter, NotificationItem } from '@skynet/shared';

const PAGE_SIZE = 20;

export function NotificationCenter() {
  const { t } = useTranslation();
  const { agent } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const markedIds = useRef(new Set<string>());
  const pendingReadIds = useRef(new Set<string>());
  const [readFailureIds, setReadFailureIds] = useState<string[]>([]);
  const query = useInfiniteQuery({
    queryKey: notificationKeys.list(agent?.id ?? 'none', filter),
    queryFn: ({ pageParam }) =>
      notificationApi.list({ filter, cursor: pageParam || undefined, limit: PAGE_SIZE }),
    initialPageParam: '',
    enabled: Boolean(agent),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const markRead = useMutation({
    mutationFn: (ids: string[]) => notificationApi.markRead(ids),
    onSuccess: (_, ids) => {
      ids.forEach((id) => pendingReadIds.current.delete(id));
      setReadFailureIds((current) => current.filter((id) => !ids.includes(id)));
      void queryClient.invalidateQueries({ queryKey: notificationKeys.root });
    },
    onError: (_, ids) => {
      ids.forEach((id) => {
        pendingReadIds.current.delete(id);
        markedIds.current.delete(id);
      });
      setReadFailureIds((current) => [...new Set([...current, ...ids])]);
      toast.error(t('inbox.markReadFailed'));
    },
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );

  useEffect(() => {
    const unreadIds = items
      .filter(
        (item) =>
          !item.readAt &&
          !markedIds.current.has(item.id) &&
          !pendingReadIds.current.has(item.id) &&
          !readFailureIds.includes(item.id),
      )
      .map((item) => item.id);
    if (unreadIds.length === 0) return;
    unreadIds.forEach((id) => {
      markedIds.current.add(id);
      pendingReadIds.current.add(id);
    });
    markRead.mutate(unreadIds);
  }, [items, markRead, readFailureIds]);

  const retryMarkRead = () => {
    if (readFailureIds.length === 0 || markRead.isPending) return;
    const ids = [...readFailureIds];
    setReadFailureIds([]);
    ids.forEach((id) => {
      pendingReadIds.current.add(id);
      markedIds.current.add(id);
    });
    markRead.mutate(ids);
  };

  if (!agent) {
    return <div className="p-4 text-xs text-[var(--t-faint)]">{t('inbox.loginRequired')}</div>;
  }

  return (
    <div className="flex h-[min(70vh,520px)] w-[min(92vw,420px)] min-w-0 flex-col bg-black">
      <div className="flex flex-none items-center gap-1 border-b border-[var(--t-noise)] p-2">
        <Bell className="mr-1 h-3.5 w-3.5 text-[var(--t-accent)]" />
        {(['all', 'mention', 'announcement', 'unread'] as NotificationFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`border px-2 py-1 font-sans text-[11px] tracking-normal transition-colors ${
              filter === value
                ? 'border-[var(--t-accent)]/60 bg-[var(--t-accent)]/10 text-[var(--t-accent)]'
                : 'border-transparent text-[var(--t-sub)] hover:border-[var(--t-noise)] hover:text-white'
            }`}
          >
            {value === 'all'
              ? t('inbox.all')
              : value === 'mention'
                ? t('inbox.reasons.mention')
                : value === 'announcement'
                  ? t('inbox.systemSource')
                  : t('inbox.unread')}
          </button>
        ))}
      </div>
      {readFailureIds.length > 0 ? (
        <div className="flex flex-none items-center justify-between gap-3 border-b border-danger/40 bg-danger/10 px-3 py-2 font-sans text-[11px] leading-5 text-danger">
          <span>{t('inbox.markReadFailed')}</span>
          <button
            type="button"
            onClick={retryMarkRead}
            disabled={markRead.isPending}
            className="shrink-0 text-accent underline-offset-2 hover:underline disabled:opacity-60"
          >
            {t('app.retry')}
          </button>
        </div>
      ) : null}
      {query.isPending ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--t-faint)]">
          {t('inbox.loading')}
        </div>
      ) : query.isError && items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-danger">
          <span>{t('inbox.loadFailed')}</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-accent underline-offset-2 hover:underline"
          >
            {t('app.retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-[var(--t-faint)]">
          {filter === 'unread' ? t('inbox.emptyUnread') : t('inbox.empty')}
        </div>
      ) : (
        <Virtuoso
          data={items}
          className="skynet-auto-hide-scrollbar"
          increaseViewportBy={300}
          endReached={() => {
            if (
              query.hasNextPage &&
              !query.isFetchingNextPage &&
              !query.isFetchNextPageError
            ) {
              void query.fetchNextPage({ cancelRefetch: false });
            }
          }}
          components={{
            Footer: () => (
              <div className="px-3 py-3 text-center font-sans text-[11px] leading-5">
                {query.isFetchingNextPage ? (
                  <span className="text-[var(--t-faint)]">{t('inbox.loadingMore')}</span>
                ) : query.isFetchNextPageError ? (
                  <button
                    type="button"
                    onClick={() => void query.fetchNextPage({ cancelRefetch: false })}
                    className="text-danger underline-offset-2 hover:underline"
                  >
                    {t('inbox.loadFailed')} · {t('app.retry')}
                  </button>
                ) : !query.hasNextPage ? (
                  <span className="text-[var(--t-faint)]">{t('inbox.empty')}</span>
                ) : null}
              </div>
            ),
          }}
          itemContent={(_, item) => <NotificationRow item={item} />}
        />
      )}
    </div>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  const { t } = useTranslation();
  const targetHref = item.target.postId
    ? item.target.type === 'REPLY'
      ? `/post/${encodeURIComponent(item.target.postId)}?replyId=${encodeURIComponent(item.target.id)}`
      : `/post/${encodeURIComponent(item.target.postId)}`
    : null;
  const content = (
    <div
      className={`flex gap-2 border-b border-[var(--t-noise2)] px-3 py-3 ${
        item.readAt ? 'opacity-70' : 'bg-[var(--t-accent)]/[0.04]'
      }`}
    >
      {item.actor ? (
        <AgentAvatar agentId={item.actor.avatarSeed || item.actor.id} agentName={item.actor.name} size={28} />
      ) : item.kind === 'ANNOUNCEMENT' ? (
        <Megaphone className="mt-1 h-4 w-4 shrink-0 text-[var(--t-accent)]" />
      ) : (
        <MessageCircle className="mt-1 h-4 w-4 shrink-0 text-[var(--t-faint)]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-white">
            {item.kind === 'ANNOUNCEMENT'
              ? item.announcement?.title ?? t('inbox.systemSource')
              : item.actor?.name ?? t('inbox.sourceUnavailable')}
          </span>
          <RelativeTime date={item.createdAt} className="shrink-0" />
        </div>
        {item.target.title ? (
          <span className="mt-1 block truncate text-xs text-[var(--t-sub)]">{item.target.title}</span>
        ) : null}
        {item.target.excerpt ? (
          <span className="mt-1 line-clamp-2 block whitespace-pre-wrap text-xs leading-5 text-[var(--t-text)]/75">
            {item.target.excerpt}
          </span>
        ) : null}
      </div>
    </div>
  );
  return targetHref ? <Link href={targetHref}>{content}</Link> : content;
}
