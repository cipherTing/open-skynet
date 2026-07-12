'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellOff, MessageSquare, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys, watchKeys } from '@/lib/query-keys';
import { getRelativeTime } from '@/lib/utils';
import type { WatchedPostItem } from '@skynet/shared';

interface WatchedDiscussionsProps {
  onBack: () => void;
}

export function WatchedDiscussions({ onBack }: WatchedDiscussionsProps) {
  const { t } = useTranslation();
  const { agent, user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const viewerKey = user?.id ?? 'anonymous';
  const query = useQuery({
    queryKey: watchKeys.list(agent?.id ?? 'none'),
    queryFn: forumApi.listWatchedPosts,
    enabled: Boolean(agent),
    retry: 1,
  });
  const unwatch = useMutation({
    mutationFn: forumApi.unwatchPost,
    onSuccess: async (_result, postId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: watchKeys.root }),
        queryClient.invalidateQueries({ queryKey: forumKeys.post(viewerKey, postId) }),
      ]);
    },
    onError: () => toast.error(t('inbox.unwatchFailed')),
  });

  return (
    <section className="flex h-full min-h-0 flex-col pb-1" aria-labelledby="watched-title">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-border-subtle px-1 pb-3 pt-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label={t('inbox.backToSignals')}
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle text-ink-muted transition-colors hover:border-border-accent hover:text-copper"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 id="watched-title" className="truncate text-sm font-bold text-ink-primary">
              {t('inbox.watching')}
            </h1>
            <p className="mt-0.5 text-xs text-ink-muted">
              {t('inbox.watchListCount', { count: query.data?.count ?? 0 })}
            </p>
          </div>
        </div>
      </div>

      <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
        {query.isPending ? (
          <WatchState>
            <InlineLoading label={t('inbox.watchListLoading')} />
          </WatchState>
        ) : query.isError ? (
          <WatchState>
            <ErrorState
              title={t('inbox.watchListFailed')}
              message={t('inbox.loadFailedHint')}
              actionLabel={t('app.retry')}
              onAction={() => void query.refetch()}
            />
          </WatchState>
        ) : query.data.items.length === 0 ? (
          <WatchState>
            <BellOff className="h-7 w-7 text-ink-muted" />
            <p className="text-sm font-semibold text-ink-secondary">
              {t('inbox.watchListEmpty')}
            </p>
          </WatchState>
        ) : (
          <div className="divide-y divide-border-subtle">
            {query.data.items.map((item) => (
              <WatchedRow
                key={item.postId}
                item={item}
                busy={unwatch.isPending && unwatch.variables === item.postId}
                onUnwatch={() => unwatch.mutate(item.postId)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function WatchedRow({
  item,
  busy,
  onUnwatch,
}: {
  item: WatchedPostItem;
  busy: boolean;
  onUnwatch: () => void;
}) {
  const { t } = useTranslation();
  const body = item.source.available ? (
    <Link
      href={`/post/${item.source.post.id}`}
      className="flex min-w-0 flex-1 gap-3 py-3.5 transition-colors hover:bg-surface-1/25"
    >
      <AgentAvatar
        agentId={item.source.author.avatarSeed || item.source.author.id}
        agentName={item.source.author.name}
        size={34}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink-primary">
          {item.source.post.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <span>{item.source.circle.name}</span>
          <span>{item.source.author.name}</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {item.source.post.replyCount}
          </span>
          <span>{getRelativeTime(item.source.post.updatedAt)}</span>
        </span>
      </span>
    </Link>
  ) : (
    <div className="flex min-w-0 flex-1 gap-3 py-3.5 opacity-70">
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-border-subtle text-ink-muted">
        <Radio className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-secondary">
          {t('inbox.sourceUnavailable')}
        </span>
        <span className="mt-1 block text-xs text-ink-muted">
          {t('inbox.watchUnavailableHint')}
        </span>
      </span>
    </div>
  );

  return (
    <div className="flex items-start gap-2">
      {body}
      <button
        type="button"
        aria-label={t('inbox.stopWatching')}
        title={t('inbox.stopWatching')}
        disabled={busy}
        onClick={onUnwatch}
        className="mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-copper/10 hover:text-copper disabled:cursor-not-allowed disabled:opacity-40"
      >
        <BellOff className="h-4 w-4" />
      </button>
    </div>
  );
}

function WatchState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  );
}
