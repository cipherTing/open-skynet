'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CircleMaintenanceLogItem,
  CircleMaintenanceLogResponse,
  CircleProposalListResponse,
  CircleProposalStatus,
} from '@skynet/shared';
import { useAuth } from '@/contexts/AuthContext';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { AuthRequiredDialog, AuthRequiredState } from '@/components/ui/AuthRequiredDialog';
import { TButton, TPanel, Timecode } from '@/components/ui/terminal';
import { CreateCircleProposalModal } from './CreateCircleProposalModal';
import { CircleMaintenanceRecordDialog } from './CircleMaintenanceRecordDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCursorPaginationRetry } from '@/hooks/useCursorPaginationRetry';

const PROPOSAL_PAGE_SIZE = 50;
const MAINTENANCE_LOG_PAGE_SIZE = 10;

/** 告警色条：进行中=荧光绿，被否决/终止=琥珀，已结=暗绿。 */
function proposalRailClass(status: CircleProposalStatus): string {
  if (status === 'DISCUSSION' || status === 'VOTING') return 'bg-[var(--t-accent)]';
  if (status === 'REJECTED' || status === 'MODERATED') return 'bg-[var(--t-signal)]';
  return 'bg-[var(--t-faint)]';
}

export function CircleCoBuildPage({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<CircleMaintenanceLogItem | null>(null);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const recordDateRange = useMemo(() => getLastSevenDays(), []);
  const circleQuery = useQuery({
    queryKey: circleKeys.detail(viewerKey, slug),
    queryFn: () => circleApi.getCircleBySlug(slug),
    enabled: !authLoading && isAuthenticated,
  });
  const circle = circleQuery.data;
  const proposalsQueryKey = circle
    ? circleKeys.proposalList(viewerKey, circle.id, 'all')
    : (['circles', 'co-build', viewerKey, slug] as const);
  const proposalsQuery = useInfiniteQuery({
    queryKey: proposalsQueryKey,
    queryFn: circle
      ? ({ pageParam }) =>
          circleApi.proposals(circle.id, {
            cursor: pageParam ?? undefined,
            limit: PROPOSAL_PAGE_SIZE,
          })
      : skipToken,
    initialPageParam: null,
    getNextPageParam: (lastPage: CircleProposalListResponse) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated && Boolean(circle),
  });
  const logsQueryKey = circle
    ? circleKeys.maintenanceLogPage(circle.id, {
        limit: MAINTENANCE_LOG_PAGE_SIZE,
        ...recordDateRange,
      })
    : (['circles', 'records', slug] as const);
  const logsQuery = useInfiniteQuery({
    queryKey: logsQueryKey,
    queryFn: circle
      ? ({ pageParam }) =>
          circleApi.maintenanceLogs(circle.id, {
            cursor: pageParam ?? undefined,
            limit: MAINTENANCE_LOG_PAGE_SIZE,
            ...recordDateRange,
          })
      : skipToken,
    initialPageParam: null,
    getNextPageParam: (lastPage: CircleMaintenanceLogResponse) => lastPage.nextCursor ?? undefined,
    enabled: isAuthenticated && Boolean(circle),
  });
  const retryProposals = useCursorPaginationRetry({
    queryKey: proposalsQueryKey,
    error: proposalsQuery.error,
    isNextPageError: proposalsQuery.isFetchNextPageError,
    fetchNextPage: proposalsQuery.fetchNextPage,
    refetch: proposalsQuery.refetch,
  });
  const retryLogs = useCursorPaginationRetry({
    queryKey: logsQueryKey,
    error: logsQuery.error,
    isNextPageError: logsQuery.isFetchNextPageError,
    fetchNextPage: logsQuery.fetchNextPage,
    refetch: logsQuery.refetch,
  });
  const proposals = useMemo(
    () => proposalsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [proposalsQuery.data?.pages],
  );
  const maintenanceLogs = useMemo(
    () => logsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [logsQuery.data?.pages],
  );
  const active = useMemo(
    () => proposals.filter((item) => item.status === 'DISCUSSION' || item.status === 'VOTING'),
    [proposals],
  );
  const history = useMemo(
    () => proposals.filter((item) => item.status !== 'DISCUSSION' && item.status !== 'VOTING'),
    [proposals],
  );

  if (!authLoading && !isAuthenticated) {
    return (
      <PageState>
        <AuthRequiredState onOpen={() => setAuthPromptOpen(true)} />
        <AuthRequiredDialog open={authPromptOpen} onOpenChange={setAuthPromptOpen} />
      </PageState>
    );
  }

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
      queryClient.invalidateQueries({ queryKey: circleKeys.proposals(viewerKey, circle.id) }),
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
              <h1 className="text-2xl font-black tracking-normal text-white">/{circle.name}</h1>
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
                <p className="text-sm leading-7 text-[var(--t-text)]">{circle.topic}</p>
                <p className="mt-1 font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                  {circle.topicOrigin === 'CREATION'
                    ? t('circles.coBuild.creationTopic')
                    : t('circles.coBuild.communityTopic')}
                </p>
                <div className="mt-4 space-y-2 border-t border-[var(--t-noise2)] pt-3">
                  {circle.rules.length ? (
                    circle.rules.map((rule, index) => (
                      <p key={rule.id} className="text-sm leading-6 text-[var(--t-text)]/70">
                        <span className="mr-2 font-mono text-[11px] text-[var(--t-faint)]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        {rule.text}
                      </p>
                    ))
                  ) : (
                    <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                      {t('circles.coBuild.noRules')}
                    </p>
                  )}
                </div>
              </TPanel>

              <ProposalSection
                title={t('circles.coBuild.active')}
                items={active}
                circleSlug={circle.slug}
                empty={t('circles.coBuild.noActive')}
              />
              <ProposalSection
                title={t('circles.coBuild.history')}
                items={history}
                circleSlug={circle.slug}
                empty={t('circles.coBuild.noHistory')}
              />
              {proposalsQuery.hasNextPage || proposalsQuery.isFetchNextPageError ? (
                <div className="flex justify-center">
                  <TButton
                    variant="secondary"
                    disabled={proposalsQuery.isFetchingNextPage}
                    onClick={() =>
                      void (proposalsQuery.isFetchNextPageError
                        ? retryProposals()
                        : proposalsQuery.fetchNextPage({ cancelRefetch: false }))
                    }
                  >
                    {proposalsQuery.isFetchNextPageError
                      ? t('app.retry')
                      : proposalsQuery.isFetchingNextPage
                        ? t('circles.coBuild.loadingMore')
                        : t('circles.coBuild.loadMore')}
                  </TButton>
                </div>
              ) : null}
            </div>
            <aside className="border-l border-[var(--t-noise)] pl-0 xl:pl-5">
              <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                LOG // {t('circles.coBuild.records')}
              </p>
              {logsQuery.isPending && maintenanceLogs.length === 0 ? (
                <div className="py-6">
                  <InlineLoading label={t('circles.coBuild.loading')} />
                </div>
              ) : logsQuery.isError && maintenanceLogs.length === 0 ? (
                <div className="py-5 text-xs text-[var(--t-sub)]">
                  <p>{t('circles.coBuild.recordsFailed')}</p>
                  <button
                    type="button"
                    onClick={() => void retryLogs()}
                    className="mt-2 font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)] hover:text-white"
                  >
                    {t('app.retry')}
                  </button>
                </div>
              ) : (
                <ol className="mt-3 space-y-3">
                  {maintenanceLogs.length ? (
                    maintenanceLogs.map((log) => (
                      <MaintenanceRecordItem
                        key={log.id}
                        log={log}
                        circleSlug={circle.slug}
                        onOpen={() => setSelectedRecord(log)}
                      />
                    ))
                  ) : (
                    <li className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                      {t('circles.coBuild.noRecords')}
                    </li>
                  )}
                  {logsQuery.hasNextPage ? (
                    <li>
                      <button
                        type="button"
                        disabled={logsQuery.isFetchingNextPage}
                        onClick={() =>
                          void (logsQuery.isFetchNextPageError
                            ? retryLogs()
                            : logsQuery.fetchNextPage({ cancelRefetch: false }))
                        }
                        className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)] disabled:opacity-50"
                      >
                        {logsQuery.isFetchNextPageError
                          ? t('app.retry')
                          : logsQuery.isFetchingNextPage
                            ? t('circles.coBuild.loadingMore')
                            : t('circles.coBuild.loadMoreRecords')}
                      </button>
                    </li>
                  ) : null}
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
      <p className="text-[var(--t-text)]/70 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]">
        <span
          aria-hidden
          className="mr-1.5 font-mono text-[var(--t-faint)] group-hover:text-[var(--t-accent)]"
        >
          &gt;
        </span>
        {t(`circles.coBuild.recordActions.${log.action}`)}
      </p>
      <Timecode date={log.createdAt} withDate className="mt-0.5 block" />
    </>
  );
  return (
    <li className="border-l border-[var(--t-noise)] pl-3 text-xs leading-5">
      {log.proposalId ? (
        <Link
          href={`/circles/${circleSlug}/co-build/${log.proposalId}`}
          className="group block focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]"
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="group block w-full text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]"
        >
          {content}
        </button>
      )}
    </li>
  );
}

function ProposalSection({
  title,
  items,
  circleSlug,
  empty,
}: {
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
      <div className="mb-3 flex items-center gap-2 font-sans text-[12px] font-medium tracking-normal">
        <span className="text-white">{title}</span>
        <span aria-hidden className="h-px flex-1 bg-[var(--t-noise)]" />
      </div>
      {items.length ? (
        <div className="divide-y divide-[var(--t-noise2)] border-y border-[var(--t-noise)]">
          {items.map((proposal) => (
            <Link
              key={proposal.id}
              href={`/circles/${circleSlug}/co-build/${proposal.id}`}
              className="group relative flex items-center justify-between gap-4 py-3 pl-4 pr-2 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)]/[0.04] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]"
            >
              <span
                aria-hidden
                className={`absolute left-0 top-0 h-full w-[2px] ${proposalRailClass(proposal.status)}`}
              />
              <div className="min-w-0 transition-transform duration-100 [transition-timing-function:steps(2,end)] group-hover:translate-x-1">
                <p className="truncate text-sm font-semibold text-white">
                  {t(`circles.coBuild.scopes.${proposal.scope}`)}
                </p>
                <p className="mt-1 font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                  {proposal.creator.name} · {t(`circles.coBuild.statuses.${proposal.status}`)} ·{' '}
                  {t('circles.coBuild.quorum', { count: proposal.quorum })}
                </p>
              </div>
              <Timecode
                date={proposal.updatedAt}
                withDate
                className="shrink-0 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[var(--t-accent)]"
              />
            </Link>
          ))}
        </div>
      ) : (
        <p className="border border-dashed border-[var(--t-noise)] px-4 py-6 font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
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
