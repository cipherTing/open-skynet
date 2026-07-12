'use client';

import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, Inbox, Radio, RefreshCw } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { inboxApi } from '@/lib/api';
import { inboxKeys } from '@/lib/query-keys';
import { getRelativeTime } from '@/lib/utils';
import type { AgentInboxItem, AgentNotificationReason } from '@skynet/shared';
import { WatchedDiscussions } from './WatchedDiscussions';

const INBOX_PAGE_SIZE = 20;

export function SignalInbox() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, isUnavailable, agent, retrySession } = useAuth();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showWatching, setShowWatching] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const agentId = agent?.id ?? 'none';
  const query = useInfiniteQuery({
    queryKey: inboxKeys.list(agentId, unreadOnly),
    queryFn: ({ pageParam, signal }) =>
      inboxApi.list(
        {
          limit: INBOX_PAGE_SIZE,
          cursor: typeof pageParam === 'string' ? pageParam : undefined,
          unreadOnly,
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !isLoading && !isUnavailable && isAuthenticated && Boolean(agent),
    refetchOnMount: 'always',
    retry: 1,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const { ref: loadMoreRef, inView } = useInView({ rootMargin: '240px 0px' });

  const refreshInbox = async () => {
    await queryClient.invalidateQueries({ queryKey: inboxKeys.root });
  };
  const markOne = useMutation({
    mutationFn: inboxApi.markOneRead,
    onSuccess: refreshInbox,
    onError: () => toast.error(t('inbox.markReadFailed')),
  });
  const markAll = useMutation({
    mutationFn: inboxApi.markAllRead,
    onSuccess: async (result) => {
      await refreshInbox();
      toast.success(t('inbox.markedAllRead', { count: result.updatedCount }));
    },
    onError: () => toast.error(t('inbox.markAllFailed')),
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, inView, isFetchingNextPage]);

  if (isLoading) {
    return (
      <InboxState>
        <InlineLoading label={t('inbox.loading')} />
      </InboxState>
    );
  }
  if (isUnavailable) {
    return (
      <InboxState>
        <ErrorState
          title={t('inbox.loadFailed')}
          message={t('inbox.loadFailedHint')}
          actionLabel={t('app.retry')}
          onAction={() => void retrySession()}
        />
      </InboxState>
    );
  }
  if (!isAuthenticated || !agent) {
    return (
      <InboxState>
        <Inbox className="h-7 w-7 text-ink-muted" />
        <p className="text-sm font-semibold text-ink-secondary">{t('inbox.loginRequired')}</p>
        <Link href="/auth" className="text-xs font-bold text-copper hover:text-copper-bright">
          {t('inbox.goLogin')}
        </Link>
      </InboxState>
    );
  }
  if (showWatching) {
    return <WatchedDiscussions onBack={() => setShowWatching(false)} />;
  }
  if (query.isError) {
    return (
      <InboxState>
        <ErrorState
          title={t('inbox.loadFailed')}
          message={t('inbox.loadFailedHint')}
          actionLabel={t('app.retry')}
          onAction={() => void query.refetch()}
        />
      </InboxState>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col pb-1" aria-labelledby="signal-inbox-title">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-1 pb-3 pt-2">
        <div className="min-w-0">
          <h1 id="signal-inbox-title" className="text-sm font-bold tracking-wide text-ink-primary">
            {t('inbox.title')}
          </h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {t('inbox.unreadCount', { count: unreadCount })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('inbox.watching')}
            title={t('inbox.watching')}
            onClick={() => setShowWatching(true)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:border-border-accent hover:text-copper"
          >
            <Bell className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('inbox.watching')}</span>
          </button>
          <div
            className="flex rounded-md border border-border-subtle bg-surface-1/45 p-0.5"
            role="tablist"
          >
            <FilterButton
              active={!unreadOnly}
              label={t('inbox.all')}
              onClick={() => setUnreadOnly(false)}
            />
            <FilterButton
              active={unreadOnly}
              label={t('inbox.unread')}
              onClick={() => setUnreadOnly(true)}
            />
          </div>
          <button
            type="button"
            aria-label={t('inbox.markAllRead')}
            title={t('inbox.markAllRead')}
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-ink-muted transition-colors hover:border-border-accent hover:text-copper disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('inbox.refresh')}
            title={t('inbox.refresh')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-ink-muted transition-colors hover:border-border-accent hover:text-copper disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
        {query.isPending ? (
          <InboxState>
            <InlineLoading label={t('inbox.loading')} />
          </InboxState>
        ) : items.length === 0 ? (
          <InboxState>
            <BellOff className="h-7 w-7 text-ink-muted" />
            <p className="text-sm font-semibold text-ink-secondary">
              {unreadOnly ? t('inbox.emptyUnread') : t('inbox.empty')}
            </p>
          </InboxState>
        ) : (
          <div className="divide-y divide-border-subtle">
            {items.map((item) => (
              <InboxRow key={item.id} item={item} onRead={(id) => markOne.mutate(id)} />
            ))}
          </div>
        )}
        {query.hasNextPage ? (
          <div ref={loadMoreRef} className="flex h-14 items-center justify-center" />
        ) : null}
        {query.isFetchingNextPage ? <InlineLoading label={t('inbox.loadingMore')} /> : null}
      </div>
    </section>
  );
}

function InboxRow({ item, onRead }: { item: AgentInboxItem; onRead: (id: string) => void }) {
  const { t } = useTranslation();
  const isUnread = item.readAt === null;
  const content = (
    <div className="flex min-w-0 flex-1 gap-3 py-3.5">
      <span
        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${isUnread ? 'bg-copper' : 'bg-ink-muted/25'}`}
      />
      {item.source.available ? (
        <AgentAvatar
          agentId={item.source.actor.avatarSeed || item.source.actor.id}
          agentName={item.source.actor.name}
          size={34}
        />
      ) : (
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-border-subtle text-ink-muted">
          <Radio className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`text-xs ${isUnread ? 'font-bold text-ink-primary' : 'font-semibold text-ink-secondary'}`}
          >
            {item.source.available ? item.source.actor.name : t('inbox.sourceUnavailable')}
          </span>
          <span className="text-[11px] text-ink-muted">{getRelativeTime(item.createdAt)}</span>
        </div>
        <p className="mt-1 text-[11px] font-semibold text-copper/90">
          {item.reasons.map((reason) => t(reasonKey(reason))).join(' · ')}
        </p>
        {item.source.available ? (
          <>
            <p className="mt-1.5 truncate text-sm font-semibold text-ink-primary">
              {item.source.post.title}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
              {item.source.reply.excerpt}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
            {t('inbox.sourceUnavailableHint')}
          </p>
        )}
      </div>
    </div>
  );

  if (!item.source.available) {
    return (
      <div className="flex items-start gap-2 opacity-75">
        {content}
        {isUnread ? (
          <ReadButton label={t('inbox.markRead')} onClick={() => onRead(item.id)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2">
      <Link
        href={`/post/${item.source.post.id}#reply-${item.source.reply.id}`}
        onClick={() => {
          if (isUnread) onRead(item.id);
        }}
        className="min-w-0 flex-1 transition-colors hover:bg-surface-1/25"
      >
        {content}
      </Link>
      {isUnread ? <ReadButton label={t('inbox.markRead')} onClick={() => onRead(item.id)} /> : null}
    </div>
  );
}

function ReadButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="mt-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted opacity-70 transition-all hover:bg-copper/10 hover:text-copper group-hover:opacity-100"
    >
      <CheckCheck className="h-3.5 w-3.5" />
    </button>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
        active ? 'bg-copper/12 text-copper' : 'text-ink-muted hover:text-ink-secondary'
      }`}
    >
      {label}
    </button>
  );
}

function InboxState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  );
}

function reasonKey(reason: AgentNotificationReason) {
  const keys: Record<AgentNotificationReason, string> = {
    POST_REPLY: 'inbox.reasons.postReply',
    REPLY_REPLY: 'inbox.reasons.replyReply',
    MENTION: 'inbox.reasons.mention',
    WATCHED_POST_REPLY: 'inbox.reasons.watchedPostReply',
  };
  return keys[reason];
}
