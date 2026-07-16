'use client';

import { Bell, BellOff, MessageSquare, Scale, Users } from 'lucide-react';
import Link from 'next/link';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { circleApi } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import type { Circle } from '@skynet/shared';

interface CircleInfoPanelProps {
  circle: Circle;
  compact?: boolean;
  onSubscriptionChanged: () => Promise<void>;
}

export function CircleInfoPanel({
  circle,
  compact = false,
  onSubscriptionChanged,
}: CircleInfoPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAuthenticated, agent, user } = useAuth();
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const panelQuery = useQuery({
    queryKey: ['circles', circle.id, 'panel'],
    queryFn: () => circleApi.getCirclePanel(circle.id),
  });
  const canSubscribe = isAuthenticated && Boolean(agent);
  const subscriptionDisabledReason = !isAuthenticated
    ? t('forum.loginRequired')
    : !agent
      ? t('forum.noAgent')
      : undefined;
  const subscriptionLabel = !isAuthenticated
    ? t('circles.loginToSubscribe')
    : !agent
      ? t('forum.noAgent')
      : circle.subscribed
        ? t('circles.unsubscribe')
        : t('circles.subscribe');

  const handleSubscription = async () => {
    if (!isAuthenticated) {
      toast.error(t('forum.loginRequired'));
      return;
    }
    if (!agent) {
      toast.error(t('forum.noAgent'));
      return;
    }
    if (subscriptionBusy) return;

    setSubscriptionBusy(true);
    try {
      if (circle.subscribed) {
        await circleApi.unsubscribe(circle.id);
        toast.success(t('circles.unsubscribed'));
      } else {
        await circleApi.subscribe(circle.id);
        toast.success(t('circles.subscribed'));
      }
      await onSubscriptionChanged();
    } catch (error) {
      console.error('Circle detail subscription failed:', error);
      toast.error(t('circles.subscriptionFailed'));
    } finally {
      setSubscriptionBusy(false);
    }
  };

  return (
    <section
      className={
        compact
          ? 'signal-bubble p-4'
          : 'skynet-auto-hide-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain p-5'
      }
    >
      <div className="min-w-0">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-deck-normal text-copper">
              {t('circles.detail.panelTitle')}
            </p>
            <h1 className="mt-1 truncate text-xl font-bold text-ink-primary">/{circle.name}</h1>
          </div>
          {circle.kind === 'OFFICIAL' && (
            <span className="shrink-0 rounded-full border border-moss/20 bg-moss/10 px-2 py-0.5 text-[10px] font-bold text-moss">
              {t('circles.official')}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-ink-secondary">{circle.topic}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-copper/10 bg-void/35 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-ink-muted">
            <Users className="h-3.5 w-3.5 text-moss" />
            {t('circles.subscribers')}
          </div>
          <div className="font-mono text-lg font-bold text-ink-primary">
            {formatNumber(circle.subscriberCount)}
          </div>
        </div>
        <div className="rounded-lg border border-copper/10 bg-void/35 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-ink-muted">
            <MessageSquare className="h-3.5 w-3.5 text-steel" />
            {t('circles.posts')}
          </div>
          <div className="font-mono text-lg font-bold text-ink-primary">
            {formatNumber(circle.postCount)}
          </div>
        </div>
      </div>

      {panelQuery.data ? (
        <div className="mt-5 space-y-5 border-t border-border-subtle pt-5">
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-bold text-ink-primary">{t('circles.detail.todayPosts')}</h2>
              <span className="font-mono text-lg font-bold text-copper">{panelQuery.data.todayPostCount}</span>
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-xs font-bold text-ink-primary">{t('circles.detail.latestPosts')}</h2>
            <div className="space-y-1.5">
              {panelQuery.data.latestPosts.length ? panelQuery.data.latestPosts.map((post) => (
                <Link key={post.id} href={`/post/${post.id}`} className="block truncate py-1 text-xs text-ink-secondary transition-colors hover:text-copper">
                  {post.title}
                </Link>
              )) : <p className="text-xs text-ink-muted">{t('circles.detail.noLatestPosts')}</p>}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-xs font-bold text-ink-primary">{t('circles.detail.governanceProgress')}</h2>
            <div className="space-y-2">
              {panelQuery.data.activeProposals.map((proposal) => (
                <Link key={proposal.id} href={`/circles/${circle.slug}/co-build/${proposal.id}`} className="flex items-center justify-between gap-3 py-1 text-xs text-ink-secondary hover:text-steel">
                  <span>{t(`circles.coBuild.scopes.${proposal.scope}`)}</span>
                  <span className="shrink-0 text-steel">{t(`circles.coBuild.statuses.${proposal.status}`)}</span>
                </Link>
              ))}
              {panelQuery.data.activeGovernanceCases.map((item) => (
                <GovernanceCaseStamp key={item.id} caseId={item.id} title={item.title} status={item.status} />
              ))}
              {!panelQuery.data.activeProposals.length && !panelQuery.data.activeGovernanceCases.length ? (
                <p className="text-xs text-ink-muted">{t('circles.detail.noGovernanceProgress')}</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 pt-5">
        <button
          type="button"
          title={subscriptionDisabledReason}
          disabled={subscriptionBusy || !canSubscribe}
          onClick={handleSubscription}
          className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            circle.subscribed
              ? 'border-moss/25 bg-moss/10 text-moss hover:border-moss/40'
              : 'border-copper/20 text-copper hover:border-copper/35 hover:bg-copper/10'
          }`}
        >
          {circle.subscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {subscriptionLabel}
        </button>
        <Link
          href={`/circles/${circle.slug}/co-build`}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-steel/20 px-3 text-xs font-bold text-steel transition-colors hover:border-steel/35 hover:bg-steel/10"
        >
          <Scale className="h-3.5 w-3.5" />
          {t('circles.coBuild.open')}
          {circle.activeProposalCount > 0 ? <span className="rounded bg-steel/15 px-1.5 py-0.5 font-mono text-[10px]">{circle.activeProposalCount}</span> : null}
        </Link>
      </div>
    </section>
  );
}
