'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CircleMaintenanceLogItem, CircleProposalStatus } from '@skynet/shared';
import { useAuth } from '@/contexts/AuthContext';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { TButton, TPanel, Timecode } from '@/components/ui/terminal';
import { CreateCircleProposalModal } from './CreateCircleProposalModal';
import { CircleMaintenanceRecordDialog } from './CircleMaintenanceRecordDialog';
import { PageHeader } from '@/components/layout/PageHeader';

/** 告警色条：进行中=荧光绿，被否决/终止=琥珀，已结=暗绿。 */
function proposalRailClass(status: CircleProposalStatus): string {
  if (status === 'DISCUSSION' || status === 'VOTING') return 'bg-[#ADFF2F]';
  if (status === 'REJECTED' || status === 'MODERATED') return 'bg-[#A16207]';
  return 'bg-[#3A5A3A]';
}

export function CircleCoBuildPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<CircleMaintenanceLogItem | null>(null);
  const recordDateRange = useMemo(() => getLastSevenDays(), []);
  const circleQuery = useQuery({
    queryKey: circleKeys.detail(viewerKey, slug),
    queryFn: () => circleApi.getCircleBySlug(slug),
    enabled: !authLoading,
  });
  const circle = circleQuery.data;
  const proposalsQuery = useQuery({
    queryKey: circle ? circleKeys.proposalList(circle.id, 'all') : ['circles', 'co-build', slug],
    queryFn: () => circleApi.proposals(circle!.id, { pageSize: 50 }),
    enabled: Boolean(circle),
  });
  const logsQuery = useQuery({
    queryKey: circle
      ? circleKeys.maintenanceLogPage(circle.id, { page: 1, pageSize: 10, ...recordDateRange })
      : ['circles', 'records', slug],
    queryFn: () =>
      circleApi.maintenanceLogs(circle!.id, { page: 1, pageSize: 10, ...recordDateRange }),
    enabled: Boolean(circle),
  });
  const active = useMemo(
    () =>
      proposalsQuery.data?.items.filter(
        (item) => item.status === 'DISCUSSION' || item.status === 'VOTING',
      ) ?? [],
    [proposalsQuery.data],
  );
  const history = useMemo(
    () =>
      proposalsQuery.data?.items.filter(
        (item) => item.status !== 'DISCUSSION' && item.status !== 'VOTING',
      ) ?? [],
    [proposalsQuery.data],
  );

  if (circleQuery.isPending)
    return (
      <PageState>
        <InlineLoading label={t('circles.coBuild.loading')} />
      </PageState>
    );
  if (circleQuery.isError || !circle)
    return (
      <PageState>
        <ErrorState
          title={t('circles.coBuild.loadFailed')}
          message={t('circles.coBuild.loadFailed')}
          actionLabel={t('app.retry')}
          onAction={() => void circleQuery.refetch()}
        />
      </PageState>
    );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: circleKeys.detail(viewerKey, slug) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.proposals(circle.id) }),
      queryClient.invalidateQueries({ queryKey: circleKeys.maintenanceLogs(circle.id) }),
    ]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader titleKey="circles.coBuild.title" />
      <main className="skynet-auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                CO-BUILD // {circle.slug}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
                /{circle.name}
              </h1>
            </div>
            <TButton variant="primary" onClick={() => setCreateOpen(true)}>
              <FilePlus2 className="h-3.5 w-3.5" />
              {t('circles.coBuild.create')}
            </TButton>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-7">
              <TPanel
                title={t('circles.coBuild.currentState')}
                meta={t('circles.coBuild.topicVersion', { version: circle.topicVersion })}
              >
                <p className="text-sm leading-7 text-[#EDF3ED]">{circle.topic}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                  {circle.topicOrigin === 'CREATION'
                    ? t('circles.coBuild.creationTopic')
                    : t('circles.coBuild.communityTopic')}
                </p>
                <div className="mt-4 space-y-2 border-t border-[#122012] pt-3">
                  {circle.rules.length ? (
                    circle.rules.map((rule, index) => (
                      <p key={rule.id} className="text-sm leading-6 text-[#EDF3ED]/70">
                        <span className="mr-2 font-mono text-[11px] text-[#3A5A3A]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        {rule.text}
                      </p>
                    ))
                  ) : (
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                      {t('circles.coBuild.noRules')}
                    </p>
                  )}
                </div>
              </TPanel>

              <ProposalSection
                chapter="CH.01"
                title={t('circles.coBuild.active')}
                items={active}
                circleSlug={circle.slug}
                empty={t('circles.coBuild.noActive')}
              />
              <ProposalSection
                chapter="CH.02"
                title={t('circles.coBuild.history')}
                items={history}
                circleSlug={circle.slug}
                empty={t('circles.coBuild.noHistory')}
              />
            </div>
            <aside className="border-l border-[#1A2E1A] pl-0 xl:pl-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                LOG // {t('circles.coBuild.records')}
              </p>
              {logsQuery.isPending ? (
                <div className="py-6">
                  <InlineLoading label={t('circles.coBuild.loading')} />
                </div>
              ) : logsQuery.isError ? (
                <div className="py-5 text-xs text-[#3A5A3A]">
                  <p>{t('circles.coBuild.recordsFailed')}</p>
                  <button
                    type="button"
                    onClick={() => void logsQuery.refetch()}
                    className="mt-2 font-mono text-[11px] uppercase tracking-[0.15em] text-[#ADFF2F] hover:text-white"
                  >
                    {t('app.retry')}
                  </button>
                </div>
              ) : (
                <ol className="mt-3 space-y-3">
                  {logsQuery.data.items.length ? (
                    logsQuery.data.items.map((log) => (
                      <MaintenanceRecordItem
                        key={log.id}
                        log={log}
                        circleSlug={circle.slug}
                        onOpen={() => setSelectedRecord(log)}
                      />
                    ))
                  ) : (
                    <li className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                      {t('circles.coBuild.noRecords')}
                    </li>
                  )}
                </ol>
              )}
            </aside>
          </div>
        </div>
        {createOpen && (
          <CreateCircleProposalModal
            circle={circle}
            onClose={() => setCreateOpen(false)}
            onCreated={async () => {
              await refresh();
            }}
          />
        )}
        {selectedRecord ? (
          <CircleMaintenanceRecordDialog
            circleId={circle.id}
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
          />
        ) : null}
      </main>
    </div>
  );
}

function MaintenanceRecordItem({
  log,
  circleSlug,
  onOpen,
}: {
  log: CircleMaintenanceLogItem;
  circleSlug: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const content = (
    <>
      <p className="text-[#EDF3ED]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]">
        {t(`circles.coBuild.recordActions.${log.action}`)}
      </p>
      <Timecode date={log.createdAt} withDate className="mt-0.5 block" />
    </>
  );
  return (
    <li className="border-l border-[#1A2E1A] pl-3 text-xs leading-5">
      {log.proposalId ? (
        <Link
          href={`/circles/${circleSlug}/co-build/${log.proposalId}`}
          className="group block focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ADFF2F]"
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="group block w-full text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ADFF2F]"
        >
          {content}
        </button>
      )}
    </li>
  );
}

function ProposalSection({
  chapter,
  title,
  items,
  circleSlug,
  empty,
}: {
  chapter: string;
  title: string;
  items: Array<{
    id: string;
    scope: string;
    status: CircleProposalStatus;
    creator: { name: string };
    updatedAt: string;
    quorum: number;
  }>;
  circleSlug: string;
  empty: string;
}) {
  const { t } = useTranslation();
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em]">
        <span className="text-[#ADFF2F]">{chapter}</span>
        <span aria-hidden className="h-px w-6 bg-[#1A2E1A]" />
        <span className="text-white">{title}</span>
      </div>
      {items.length ? (
        <div className="divide-y divide-[#122012] border-y border-[#1A2E1A]">
          {items.map((proposal) => (
            <Link
              key={proposal.id}
              href={`/circles/${circleSlug}/co-build/${proposal.id}`}
              className="group relative flex items-center justify-between gap-4 py-3 pl-4 pr-2 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#ADFF2F]/[0.04] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ADFF2F]"
            >
              <span
                aria-hidden
                className={`absolute left-0 top-0 h-full w-[2px] ${proposalRailClass(proposal.status)}`}
              />
              <div className="min-w-0 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-1">
                <p className="truncate text-sm font-semibold text-white">
                  {t(`circles.coBuild.scopes.${proposal.scope}`)}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                  {proposal.creator.name} · {t(`circles.coBuild.statuses.${proposal.status}`)} ·{' '}
                  {t('circles.coBuild.quorum', { count: proposal.quorum })}
                </p>
              </div>
              <Timecode
                date={proposal.updatedAt}
                withDate
                className="shrink-0 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]"
              />
            </Link>
          ))}
        </div>
      ) : (
        <p className="border border-dashed border-[#1A2E1A] px-4 py-6 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          {empty}
        </p>
      )}
    </section>
  );
}

function PageState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader titleKey="circles.coBuild.title" />
      <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-16">{children}</main>
    </div>
  );
}
function getLastSevenDays() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}
