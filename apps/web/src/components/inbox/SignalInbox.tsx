'use client';

import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox, Radio, RefreshCw } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import LogStream from '@/components/home/terminal/LogStream';
import { ScanlineReveal } from '@/components/home/terminal/ScanlineReveal';
import { AgentAvatar } from '@/components/ui/AgentAvatar';
import { ErrorState } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/SignalToast';
import { TButton, TEmpty, TSkeleton, TTabs, Timecode } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { inboxApi } from '@/lib/api';
import { inboxKeys } from '@/lib/query-keys';
import type { AgentInboxItem, AgentNotificationReason } from '@skynet/shared';
import { WatchedDiscussions } from './WatchedDiscussions';

const INBOX_PAGE_SIZE = 20;

type InboxSourceKind = Extract<AgentInboxItem['source'], { available: true }>['kind'];

/** 总线帧类型代号（机器遥测文案，豁免 i18n） */
const FRAME_CODES: Record<InboxSourceKind, string> = {
  REPLY: 'REPLY',
  CIRCLE_PROPOSAL: 'CO-BUILD',
  REVIEW_REQUEST: 'REVIEW',
  GOVERNANCE_CASE: 'GOV.CASE',
  GOVERNANCE_CORRECTION: 'GOV.FIX',
  AGENT_GOVERNANCE: 'GOV.AGT',
};

function frameCode(item: AgentInboxItem): string {
  if (!item.source.available) return 'VOID';
  if (item.reasons.includes('MENTION')) return 'MENTION';
  return FRAME_CODES[item.source.kind];
}

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
    return <InboxSkeleton label={t('inbox.loading')} />;
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
        <Inbox className="h-7 w-7 text-[#3A5A3A]" />
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          {t('inbox.loginRequired')}
        </p>
        <Link
          href="/auth"
          className="font-mono text-[11px] tracking-[0.15em] text-[#ADFF2F] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
        >
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
      <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-[#1A2E1A] px-1 pb-3 pt-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F]">
              {t('sections.inbox.code')}
            </span>
            <h1 id="signal-inbox-title" className="text-sm font-bold tracking-wide text-white">
              {t('inbox.title')}
            </h1>
          </div>
          <p
            className={`mt-0.5 font-mono text-[11px] tabular-nums tracking-[0.15em] ${
              unreadCount > 0 ? 'text-[#ADFF2F]' : 'text-[#3A5A3A]'
            }`}
          >
            {t('inbox.unreadCount', { count: unreadCount })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TTabs
            items={[
              { id: 'all', label: t('inbox.all') },
              { id: 'unread', label: t('inbox.unread') },
            ]}
            active={unreadOnly ? 'unread' : 'all'}
            onChange={(id) => setUnreadOnly(id === 'unread')}
          />
          <TButton
            variant="secondary"
            size="sm"
            aria-label={t('inbox.watching')}
            title={t('inbox.watching')}
            onClick={() => setShowWatching(true)}
          >
            <Bell className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('inbox.watching')}</span>
          </TButton>
          <TButton
            variant="primary"
            size="sm"
            aria-label={t('inbox.markAllRead')}
            title={t('inbox.markAllRead')}
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('inbox.markAllRead')}</span>
          </TButton>
          <TButton
            variant="secondary"
            size="sm"
            aria-label={t('inbox.refresh')}
            title={t('inbox.refresh')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${query.isFetching ? '[animation:t-spin-step_0.8s_steps(8)_infinite]' : ''}`}
            />
          </TButton>
        </div>
      </div>

      <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
        <ScanlineReveal key={unreadOnly ? 'unread' : 'all'}>
          {query.isPending ? (
            <InboxSkeleton label={t('inbox.loading')} />
          ) : items.length === 0 ? (
            <TEmpty
              className="my-6"
              message={unreadOnly ? t('inbox.emptyUnread') : t('inbox.empty')}
              decoration={<LogStream rows={4} className="w-full max-w-sm opacity-60" />}
            />
          ) : (
            <div className="t-corner my-2 border border-[#1A2E1A]">
              <div className="divide-y divide-[#122012]">
                {items.map((item) => (
                  <InboxRow key={item.id} item={item} onRead={(id) => markOne.mutate(id)} />
                ))}
              </div>
            </div>
          )}
        </ScanlineReveal>
        {query.hasNextPage ? (
          <div ref={loadMoreRef} className="flex h-14 items-center justify-center" />
        ) : null}
        {query.isFetchingNextPage ? (
          <div className="px-3 py-4" role="status" aria-label={t('inbox.loadingMore')}>
            <TSkeleton rows={1} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InboxSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-5 px-3 py-6" role="status" aria-label={label}>
      <TSkeleton rows={2} />
      <TSkeleton rows={2} />
      <TSkeleton rows={2} />
      <TSkeleton rows={2} />
    </div>
  );
}

function InboxRow({ item, onRead }: { item: AgentInboxItem; onRead: (id: string) => void }) {
  const { t } = useTranslation();
  const isUnread = item.readAt === null;
  const actorName = !item.source.available
    ? t('inbox.sourceUnavailable')
    : item.source.kind === 'REPLY'
      ? item.source.actor.name
      : item.source.kind === 'CIRCLE_PROPOSAL'
        ? item.source.proposal.creatorName
        : t('inbox.systemSource');
  const content = (
    <div className="flex min-w-0 flex-1 gap-3 px-3 py-3.5 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-1">
      <div className="flex w-[92px] shrink-0 flex-col items-start gap-1 pt-0.5">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 ${isUnread ? 't-anim-blink bg-[#ADFF2F]' : 'border border-[#3A5A3A] bg-transparent'}`}
        />
        <Timecode
          date={item.createdAt}
          withDate
          className={
            isUnread
              ? 'text-[#ADFF2F]'
              : 'transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]'
          }
        />
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          {frameCode(item)}
        </span>
      </div>
      {item.source.available && item.source.kind === 'REPLY' ? (
        <AgentAvatar
          agentId={item.source.actor.avatarSeed || item.source.actor.id}
          agentName={item.source.actor.name}
          size={34}
        />
      ) : (
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-[#1A2E1A] text-[#3A5A3A]">
          <Radio className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`text-xs ${isUnread ? 'font-bold text-white' : 'font-semibold text-white/60'}`}
          >
            {actorName}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] font-semibold text-[#ADFF2F]/70">
          {item.reasons.map((reason) => t(reasonKey(reason))).join(' · ')}
        </p>
        {item.source.available && item.source.kind === 'REPLY' ? (
          <>
            <p className="mt-1.5 truncate text-sm font-semibold text-white/90">
              {item.source.post.title}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#EDF3ED]/55">
              {item.source.reply.excerpt}
            </p>
          </>
        ) : item.source.available && item.source.kind === 'CIRCLE_PROPOSAL' ? (
          <>
            <p className="mt-1.5 text-sm font-semibold text-white/90">
              {t(`circles.coBuild.scopes.${item.source.proposal.scope}`)}
            </p>
            <p className="mt-1 text-xs text-[#EDF3ED]/55">
              {t(`circles.coBuild.statuses.${item.source.proposal.status}`)}
            </p>
          </>
        ) : item.source.available && item.source.kind === 'REVIEW_REQUEST' ? (
          <>
            <p className="mt-1.5 text-sm font-semibold text-white/90">{item.source.review.title}</p>
            <p className="mt-1 text-xs text-[#EDF3ED]/55">{t(`inbox.review.${item.source.review.type}.${item.source.review.status}`)}</p>
            {item.source.review.reason ? <p className="mt-1 text-xs leading-relaxed text-[#EF4444]/80">{item.source.review.reason}</p> : null}
          </>
        ) : item.source.available && item.source.kind === 'GOVERNANCE_CASE' ? (
          <>
            <p className="mt-1.5 text-sm font-semibold text-white/90">{t('inbox.governance.caseTitle')}</p>
            <p className="mt-1 text-xs text-[#EDF3ED]/55">{t(`admin.governance.statuses.${item.source.governanceCase.status}`)}</p>
            {item.source.governanceCase.reason ? <p className="mt-1 text-xs leading-relaxed text-[#EF4444]/80">{item.source.governanceCase.reason}</p> : null}
          </>
        ) : item.source.available && item.source.kind === 'GOVERNANCE_CORRECTION' ? (
          <>
            <p className="mt-1.5 text-sm font-semibold text-white/90">{t('inbox.governance.correctionTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#ADFF2F]">{item.source.correction.reason}</p>
          </>
        ) : item.source.available && item.source.kind === 'AGENT_GOVERNANCE' ? (
          <>
            <p className="mt-1.5 text-sm font-semibold text-white/90">{t(`inbox.governance.agent.${item.source.governance.source}`)}</p>
            <p className="mt-1 text-xs text-[#EDF3ED]/55">{t('inbox.governance.healthChange', { from: item.source.governance.previousHealthLevel, to: item.source.governance.nextHealthLevel })}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#EF4444]/80">{item.source.governance.reason}</p>
          </>
        ) : (
          <p className="mt-1.5 text-xs leading-relaxed text-[#EDF3ED]/55">
            {t('inbox.sourceUnavailableHint')}
          </p>
        )}
      </div>
    </div>
  );

  const hoverRail = (
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-[2px] bg-[#ADFF2F] opacity-0 transition-opacity duration-100 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
    />
  );

  if (!item.source.available) {
    return (
      <div className="group relative flex items-start gap-2 pr-2 opacity-75">
        {hoverRail}
        {content}
        {isUnread ? (
          <ReadButton label={t('inbox.markRead')} onClick={() => onRead(item.id)} />
        ) : null}
      </div>
    );
  }

  if (item.source.kind === 'CIRCLE_PROPOSAL') {
    return (
      <div className="group relative flex items-start gap-2 pr-2">
        {hoverRail}
        <Link
          href={`/circles/${item.source.proposal.circleSlug}/co-build/${item.source.proposal.id}`}
          onClick={() => {
            if (isUnread) onRead(item.id);
          }}
          className="min-w-0 flex-1 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704]"
        >
          {content}
        </Link>
        {isUnread ? <ReadButton label={t('inbox.markRead')} onClick={() => onRead(item.id)} /> : null}
      </div>
    );
  }

  if (item.source.kind === 'REVIEW_REQUEST') {
    const href = item.source.review.status === 'APPROVED' && item.source.review.type === 'POST' && item.source.review.publishedTargetId
      ? `/post/${item.source.review.publishedTargetId}`
      : null;
    if (href) {
      return <div className="group relative flex items-start gap-2 pr-2">{hoverRail}<Link href={href} onClick={() => { if (isUnread) onRead(item.id); }} className="min-w-0 flex-1 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704]">{content}</Link>{isUnread ? <ReadButton label={t('inbox.markRead')} onClick={() => onRead(item.id)} /> : null}</div>;
    }
    return <div className="group relative flex items-start gap-2 pr-2">{hoverRail}{content}{isUnread ? <ReadButton label={t('inbox.markRead')} onClick={() => onRead(item.id)} /> : null}</div>;
  }

  if (
    item.source.kind === 'GOVERNANCE_CASE'
    || item.source.kind === 'GOVERNANCE_CORRECTION'
    || item.source.kind === 'AGENT_GOVERNANCE'
  ) {
    return <div className="group relative flex items-start gap-2 pr-2">{hoverRail}{content}{isUnread ? <ReadButton label={t('inbox.markRead')} onClick={() => onRead(item.id)} /> : null}</div>;
  }

  return (
    <div className="group relative flex items-start gap-2 pr-2">
      {hoverRail}
      <Link
        href={`/post/${item.source.post.id}?replyId=${encodeURIComponent(item.source.reply.id)}`}
        onClick={() => {
          if (isUnread) onRead(item.id);
        }}
        className="min-w-0 flex-1 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704]"
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
      className="mt-3 flex h-7 shrink-0 items-center gap-1.5 border border-transparent px-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A] opacity-0 transition-[color,border-color,opacity] duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F]/60 hover:text-[#ADFF2F] focus-visible:opacity-100 group-hover:opacity-100"
    >
      <CheckCheck className="h-3 w-3" />
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
    CO_BUILD_REVISION: 'inbox.reasons.coBuildRevision',
    CO_BUILD_OBJECTION: 'inbox.reasons.coBuildObjection',
    CO_BUILD_STATUS: 'inbox.reasons.coBuildStatus',
    REVIEW_APPROVED: 'inbox.reasons.reviewApproved',
    REVIEW_REJECTED: 'inbox.reasons.reviewRejected',
    GOVERNANCE_CASE_DECIDED: 'inbox.reasons.governanceCaseDecided',
    GOVERNANCE_CORRECTION: 'inbox.reasons.governanceCorrection',
    AGENT_BANNED: 'inbox.reasons.agentBanned',
    AGENT_UNBANNED: 'inbox.reasons.agentUnbanned',
  };
  return keys[reason];
}
