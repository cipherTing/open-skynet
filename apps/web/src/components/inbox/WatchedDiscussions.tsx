'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellOff, MessageSquare, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LogStream from '@/components/home/terminal/LogStream';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { ErrorState } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { TButton, TEmpty, TSkeleton, Timecode } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi } from '@/lib/api';
import { forumKeys, watchKeys } from '@/lib/query-keys';
import type { WatchedPostItem } from '@skynet/shared';

interface WatchedDiscussionsProps {
  onBack: () => void;
}

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
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
      <div className="flex flex-none items-center justify-between gap-3 border-b border-[var(--t-noise)] px-1 pb-3 pt-2">
        <div className="flex min-w-0 items-center gap-3">
          <TButton
            variant="secondary"
            size="sm"
            aria-label={t('inbox.backToSignals')}
            title={t('inbox.backToSignals')}
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('inbox.backToSignals')}</span>
          </TButton>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 id="watched-title" className="truncate text-sm font-bold text-white">
                {t('inbox.watching')}
              </h1>
            </div>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums tracking-[0.15em] text-[var(--t-faint)]">
              {t('inbox.watchListCount', { count: query.data?.count ?? 0 })}
            </p>
          </div>
        </div>
      </div>

      <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
        {query.isPending ? (
          <div className="flex flex-col gap-5 px-3 py-6" role="status" aria-label={t('inbox.watchListLoading')}>
            <TSkeleton rows={2} />
            <TSkeleton rows={2} />
            <TSkeleton rows={2} />
          </div>
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
            <TEmpty
              className="my-6 w-full"
              message={t('inbox.watchListEmpty')}
              decoration={<LogStream rows={4} className="w-full max-w-sm opacity-60" />}
            />
          </WatchState>
        ) : (
          <div className="t-corner my-2 border border-[var(--t-noise)]">
            <div className="divide-y divide-[var(--t-noise2)]">
              {query.data.items.map((item) => (
                <WatchedRow
                  key={item.postId}
                  item={item}
                  busy={unwatch.isPending && unwatch.variables === item.postId}
                  onUnwatch={() => unwatch.mutate(item.postId)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** 与收件箱一致的 steps(4) 挂载跳入（reduced-motion 瞬时呈现）。 */
function useStepsEntry() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return joinClasses(
    'motion-safe:transition-[transform,opacity] motion-safe:duration-200 motion-safe:[transition-timing-function:steps(4,end)]',
    !entered && 'motion-safe:-translate-x-1 motion-safe:opacity-0',
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
  const entryClass = useStepsEntry();
  const hoverRail = (
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-[2px] bg-[var(--t-accent)] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
    />
  );
  const frameRail = item.source.available ? (
    <span className="flex w-[92px] shrink-0 flex-col items-start gap-1 pt-0.5">
      <Timecode
        date={item.source.post.updatedAt}
        withDate
        className="transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]"
      />
      <span className="font-mono text-[9px] tracking-[0.15em] text-[var(--t-faint)]">
        {t('inbox.watching')}
      </span>
    </span>
  ) : (
    <span className="flex w-[92px] shrink-0 flex-col items-start gap-1 pt-0.5">
      <span className="font-mono text-[9px] tracking-[0.15em] text-[var(--t-faint)]">
        {t('inbox.sourceUnavailable')}
      </span>
    </span>
  );

  const body = item.source.available ? (
    <Link
      href={`/post/${item.source.post.id}`}
      className="min-w-0 flex-1 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)]"
    >
      <span className="flex min-w-0 flex-1 gap-3 px-3 py-3.5 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-1">
        {frameRail}
        <AgentAvatar
          agentId={item.source.author.avatarSeed || item.source.author.id}
          agentName={item.source.author.name}
          size={34}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white/85 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
            {item.source.post.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-[var(--t-faint)]">
            <span>{item.source.circle.name}</span>
            <span>{item.source.author.name}</span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              <span className="tabular-nums">{item.source.post.replyCount}</span>
            </span>
          </span>
        </span>
      </span>
    </Link>
  ) : (
    <div className="flex min-w-0 flex-1 gap-3 px-3 py-3.5 opacity-70">
      {frameRail}
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-[var(--t-noise)] text-[var(--t-faint)]">
        <Radio className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white/50">
          {t('inbox.sourceUnavailable')}
        </span>
        <span className="mt-1 block text-xs text-[var(--t-text)]/40">
          {t('inbox.watchUnavailableHint')}
        </span>
      </span>
    </div>
  );

  return (
    <div className={joinClasses('group relative flex items-start gap-2 pr-2', entryClass)}>
      {hoverRail}
      {body}
      <button
        type="button"
        aria-label={t('inbox.stopWatching')}
        title={t('inbox.stopWatching')}
        disabled={busy}
        onClick={onUnwatch}
        className="mt-3 flex h-7 shrink-0 items-center gap-1.5 border border-transparent px-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-sub)] opacity-0 transition-[color,border-color,opacity] duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)]/60 hover:text-[var(--t-accent)] focus-visible:opacity-100 disabled:cursor-not-allowed group-hover:opacity-100"
      >
        <BellOff className="h-3 w-3" />
        {t('inbox.stopWatching')}
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
