'use client';

import { MessageSquare, Scale, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { GovernanceCaseStamp } from '@/components/governance/GovernanceCaseStamp';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { circleFileNo, circleSigil } from '@/components/circle/circle-sigil';
import { TPanel, TTag, Timecode } from '@/components/ui/terminal';
import { circleApi } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import type { Circle } from '@skynet/shared';

interface CircleInfoPanelProps {
  circle: Circle;
  compact?: boolean;
}

const formatTelemetryCount = (value: number) => formatNumber(Math.max(0, Math.round(value)));

export function CircleInfoPanel({ circle, compact = false }: CircleInfoPanelProps) {
  const { t } = useTranslation();
  const panelQuery = useQuery({
    queryKey: ['circles', circle.id, 'panel'],
    queryFn: () => circleApi.getCirclePanel(circle.id),
  });

  return (
    <section
      className={
        compact
          ? 'space-y-4'
          : 'skynet-auto-hide-scrollbar flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4'
      }
    >
      <TPanel
        title={t('circles.detail.panelTitle')}
        meta={`FILE #CR-${circleFileNo(circle.slug)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden
            className="t-dotgrid flex h-10 w-20 shrink-0 select-none items-center justify-center border border-[#1A2E1A] bg-black font-mono text-xs tracking-[0.25em] text-[#ADFF2F]"
          >
            {circleSigil(circle.slug)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="min-w-0 truncate text-base font-black tracking-tight text-white">
                /{circle.name}
              </h2>
              {circle.kind === 'OFFICIAL' ? (
                <TTag color="accent">{t('circles.official')}</TTag>
              ) : null}
            </div>
            <Timecode date={circle.createdAt} withDate className="mt-1 block" />
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#EDF3ED]/70">{circle.topic}</p>

        <dl className="mt-4 divide-y divide-[#122012] border-y border-[#122012]">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              <Users className="h-3 w-3" />
              {t('circles.subscribers')}
            </dt>
            <dd>
              <TelemetryValue
                value={circle.subscriberCount}
                format={formatTelemetryCount}
                jitterPct={0.05}
                className="font-mono text-sm font-semibold text-white"
              />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              <MessageSquare className="h-3 w-3" />
              {t('circles.posts')}
            </dt>
            <dd>
              <TelemetryValue
                value={circle.postCount}
                format={formatTelemetryCount}
                jitterPct={0.05}
                className="font-mono text-sm font-semibold text-white"
              />
            </dd>
          </div>
        </dl>

        <Link
          href={`/circles/${circle.slug}/co-build`}
          className="mt-4 inline-flex h-8 w-full items-center justify-center gap-2 border border-[#1A2E1A] font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A] hover:text-[#ADFF2F]"
        >
          <Scale className="h-3.5 w-3.5" />
          {t('circles.coBuild.open')}
          {circle.activeProposalCount > 0 ? (
            <span className="border border-[#ADFF2F]/40 bg-[#ADFF2F]/10 px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#ADFF2F]">
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
              <TelemetryValue
                value={panelQuery.data.todayPostCount}
                format={formatTelemetryCount}
                jitterPct={0.05}
                className="text-[#ADFF2F]"
              />
            </span>
          }
        >
          <div className="divide-y divide-[#122012]">
            {panelQuery.data.latestPosts.length ? (
              panelQuery.data.latestPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="group flex items-center justify-between gap-3 py-2 text-xs text-[#EDF3ED]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
                >
                  <span className="min-w-0 truncate">{post.title}</span>
                  <Timecode date={post.createdAt} className="shrink-0 group-hover:text-[#ADFF2F]" />
                </Link>
              ))
            ) : (
              <p className="py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                {t('circles.detail.noLatestPosts')}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-[#122012] pt-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.15em] text-white">
              {t('circles.detail.governanceProgress')}
            </h3>
            <div className="mt-2 space-y-1.5">
              {panelQuery.data.activeProposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  href={`/circles/${circle.slug}/co-build/${proposal.id}`}
                  className="group flex items-center justify-between gap-3 py-1 text-xs text-[#EDF3ED]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
                >
                  <span className="min-w-0 truncate">
                    {t(`circles.coBuild.scopes.${proposal.scope}`)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A] group-hover:text-[#ADFF2F]">
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
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
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
