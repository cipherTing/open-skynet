'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FilePlus2, History, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CircleMaintenanceLogItem } from '@skynet/shared';
import { useAuth } from '@/contexts/AuthContext';
import { circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { ErrorState, InlineLoading } from '@/components/ui/LoadingState';
import { CreateCircleProposalModal } from './CreateCircleProposalModal';
import { CircleMaintenanceRecordDialog } from './CircleMaintenanceRecordDialog';
import { PageHeader } from '@/components/layout/PageHeader';

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
          <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-deck-normal text-copper">
                {t('circles.coBuild.currentState')}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-ink-primary">/{circle.name}</h1>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-copper px-3 text-xs font-bold text-void"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              {t('circles.coBuild.create')}
            </button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-7">
              <section className="border-b border-border-subtle pb-6">
                <div className="flex items-center gap-2 text-xs font-bold text-ink-secondary">
                  <BookOpen className="h-3.5 w-3.5 text-steel" />
                  {t('circles.coBuild.currentState')}
                </div>
                <p className="mt-3 text-sm leading-7 text-ink-primary">{circle.topic}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {circle.topicOrigin === 'CREATION'
                    ? t('circles.coBuild.creationTopic')
                    : t('circles.coBuild.communityTopic')}{' '}
                  · {t('circles.coBuild.topicVersion', { version: circle.topicVersion })}
                </p>
                <div className="mt-4 space-y-2">
                  {circle.rules.length ? (
                    circle.rules.map((rule, index) => (
                      <p key={rule.id} className="text-sm text-ink-secondary">
                        <span className="mr-2 font-mono text-ink-muted">{index + 1}.</span>
                        {rule.text}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-ink-muted">{t('circles.coBuild.noRules')}</p>
                  )}
                </div>
              </section>

              <ProposalSection
                title={t('circles.coBuild.active')}
                icon={<Scale className="h-4 w-4 text-copper" />}
                items={active}
                circleSlug={circle.slug}
                empty={t('circles.coBuild.noActive')}
              />
              <ProposalSection
                title={t('circles.coBuild.history')}
                icon={<History className="h-4 w-4 text-steel" />}
                items={history}
                circleSlug={circle.slug}
                empty={t('circles.coBuild.noHistory')}
              />
            </div>
            <aside className="border-l border-border-subtle pl-0 xl:pl-5">
              <p className="text-[11px] font-bold uppercase tracking-deck-normal text-ink-muted">
                {t('circles.coBuild.records')}
              </p>
              {logsQuery.isPending ? (
                <div className="py-6">
                  <InlineLoading label={t('circles.coBuild.loading')} />
                </div>
              ) : logsQuery.isError ? (
                <div className="py-5 text-xs text-ink-muted">
                  <p>{t('circles.coBuild.recordsFailed')}</p>
                  <button
                    type="button"
                    onClick={() => void logsQuery.refetch()}
                    className="mt-2 font-semibold text-copper hover:text-copper-bright"
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
                    <li className="text-xs text-ink-muted">{t('circles.coBuild.noRecords')}</li>
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
      <p>{t(`circles.coBuild.recordActions.${log.action}`)}</p>
      <p className="text-ink-muted">{formatDate(log.createdAt)}</p>
    </>
  );
  return (
    <li className="border-l border-border-subtle pl-3 text-xs leading-5 text-ink-secondary">
      {log.proposalId ? (
        <Link
          href={`/circles/${circleSlug}/co-build/${log.proposalId}`}
          className="block rounded-sm transition-colors hover:text-copper focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-copper"
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full rounded-sm text-left transition-colors hover:text-copper focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-copper"
        >
          {content}
        </button>
      )}
    </li>
  );
}

function ProposalSection({
  title,
  icon,
  items,
  circleSlug,
  empty,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{
    id: string;
    scope: string;
    status: string;
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
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-primary">
        {icon}
        {title}
      </div>
      {items.length ? (
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {items.map((proposal) => (
            <Link
              key={proposal.id}
              href={`/circles/${circleSlug}/co-build/${proposal.id}`}
              className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-surface-1/30"
            >
              <div>
                <p className="text-sm font-semibold text-ink-primary">
                  {t(`circles.coBuild.scopes.${proposal.scope}`)}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {proposal.creator.name} · {t(`circles.coBuild.statuses.${proposal.status}`)} ·{' '}
                  {t('circles.coBuild.quorum', { count: proposal.quorum })}
                </p>
              </div>
              <time className="shrink-0 text-xs text-ink-muted">
                {formatDate(proposal.updatedAt)}
              </time>
            </Link>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-ink-muted">{empty}</p>
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
function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
function getLastSevenDays() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}
