'use client';

import { useState } from 'react';
import { Bell, BellOff, Clock, MessageSquare, Scale, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';
import { TButton, TPanel, TTag, Timecode } from '@/components/ui/terminal';
import { useToast } from '@/components/ui/SignalToast';
import { useAuth } from '@/contexts/AuthContext';
import { circleApi } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import type { Circle } from '@skynet/shared';

interface CircleInfoPanelProps {
  circle: Circle;
  compact?: boolean;
  onSubscriptionChanged?: () => Promise<void>;
}

const formatTelemetryCount = (value: number) => formatNumber(Math.max(0, Math.round(value)));

export function CircleInfoPanel({
  circle,
  compact = false,
  onSubscriptionChanged,
}: CircleInfoPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isAuthenticated, agent } = useAuth();
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
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
  const panelQuery = useQuery({
    queryKey: ['circles', circle.id, 'panel'],
    queryFn: () => circleApi.getCirclePanel(circle.id),
  });

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
      await onSubscriptionChanged?.();
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
          ? 'space-y-4'
          : 'skynet-auto-hide-scrollbar flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4'
      }
    >
      <TPanel title={t('circles.detail.panelTitle')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-base font-black tracking-tight text-white">
            /{circle.name}
          </h2>
          {circle.kind === 'OFFICIAL' ? (
            <TTag color="accent">{t('circles.official')}</TTag>
          ) : null}
        </div>
        <Timecode date={circle.createdAt} withDate className="mt-1 block" />
        <p className="mt-3 text-sm leading-relaxed text-[var(--t-text)]/70">{circle.topic}</p>

        <TButton
          variant={circle.subscribed ? 'secondary' : 'primary'}
          title={subscriptionDisabledReason}
          disabled={subscriptionBusy || !canSubscribe}
          onClick={handleSubscription}
          className="mt-4 w-full"
        >
          {circle.subscribed ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
          {subscriptionLabel}
        </TButton>

        <dl className="mt-4 divide-y divide-[var(--t-noise2)] border-y border-[var(--t-noise2)]">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              <Users className="h-3 w-3" />
              {t('circles.subscribers')}
            </dt>
            <dd>
              <span className="inline-block whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-white">
                {formatTelemetryCount(circle.subscriberCount)}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              <MessageSquare className="h-3 w-3" />
              {t('circles.posts')}
            </dt>
            <dd>
              <span className="inline-block whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-white">
                {formatTelemetryCount(circle.postCount)}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              <Clock className="h-3 w-3" />
              {t('circleRegistry.lastActive')}
            </dt>
            <dd>
              <Timecode
                date={circle.lastPostAt ?? circle.createdAt}
                withDate
                className="inline-block whitespace-nowrap text-[var(--t-text)]"
              />
            </dd>
          </div>
        </dl>

        <Link
          href={`/circles/${circle.slug}/co-build`}
          className="mt-4 inline-flex h-8 w-full items-center justify-center gap-2 border border-[var(--t-noise)] font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-faint)] hover:text-[var(--t-accent)]"
        >
          <Scale className="h-3.5 w-3.5" />
          {t('circles.coBuild.open')}
          {circle.activeProposalCount > 0 ? (
            <span className="border border-[var(--t-accent)]/40 bg-[var(--t-accent)]/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--t-accent)]">
              {circle.activeProposalCount}
            </span>
          ) : null}
        </Link>
      </TPanel>

      {panelQuery.data ? (
        <TPanel
          title={t('circles.detail.latestPosts')}
          meta={
            <span className="inline-flex items-center gap-1.5">
              {t('circles.detail.todayPosts')}
              <span className="inline-block whitespace-nowrap font-mono tabular-nums text-[var(--t-accent)]">
                {formatTelemetryCount(panelQuery.data.todayPostCount)}
              </span>
            </span>
          }
        >
          <div className="divide-y divide-[var(--t-noise2)]">
            {panelQuery.data.latestPosts.length ? (
              panelQuery.data.latestPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="group flex items-center justify-between gap-3 py-2 text-xs text-[var(--t-text)]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
                >
                  <span className="min-w-0 truncate">{post.title}</span>
                  <Timecode date={post.createdAt} className="shrink-0 group-hover:text-[var(--t-accent)]" />
                </Link>
              ))
            ) : (
              <p className="py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('circles.detail.noLatestPosts')}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-[var(--t-noise2)] pt-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.15em] text-white">
              {t('circles.detail.governanceProgress')}
            </h3>
            <div className="mt-2 space-y-1.5">
              {panelQuery.data.activeProposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  href={`/circles/${circle.slug}/co-build/${proposal.id}`}
                  className="group flex items-center justify-between gap-3 py-1 text-xs text-[var(--t-text)]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]"
                >
                  <span className="min-w-0 truncate">
                    {t(`circles.coBuild.scopes.${proposal.scope}`)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] group-hover:text-[var(--t-accent)]">
                    {t(`circles.coBuild.statuses.${proposal.status}`)}
                  </span>
                </Link>
              ))}
              {panelQuery.data.activeGovernanceCases.map((item) => (
                <GovernanceCaseStamp
                  key={item.id}
                  caseId={item.id}
                  title={item.title}
                  status={item.status}
                />
              ))}
              {!panelQuery.data.activeProposals.length &&
              !panelQuery.data.activeGovernanceCases.length ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('circles.detail.noGovernanceProgress')}
                </p>
              ) : null}
            </div>
          </div>
        </TPanel>
      ) : null}
    </section>
  );
}
