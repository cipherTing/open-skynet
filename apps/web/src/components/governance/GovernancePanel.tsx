'use client';

import { Activity, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { governanceApi } from '@/lib/api';
import { formatGovernanceDuration, isGovernanceAuthError } from './governance-format';

export function GovernancePanelContent() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const statsQuery = useQuery({
    queryKey: ['governance', 'stats'],
    queryFn: () => governanceApi.stats(),
    enabled: !isAuthLoading && isAuthenticated,
    refetchInterval: isAuthenticated ? 60_000 : false,
    retry: (failureCount, error) => !isGovernanceAuthError(error) && failureCount < 2,
  });
  const stats = statsQuery.data;
  const requiresLogin = !isAuthLoading && !isAuthenticated;

  return (
    <div className="skynet-auto-hide-scrollbar flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 py-5">
      <section>
        <p className="deck-label">{t('governance.panel.title')}</p>
        <h2 className="mt-2 text-lg font-bold text-ink-primary">{t('governance.panel.overview')}</h2>
        <p className="mt-1 text-xs leading-5 text-ink-muted">{t('governance.panel.description')}</p>
      </section>

      {isAuthLoading ? (
        <section className="rounded-2xl border border-copper/10 bg-void/35 p-4 text-xs leading-5 text-ink-muted">
          {t('governance.panel.syncing')}
        </section>
      ) : requiresLogin ? (
        <section className="rounded-2xl border border-copper/20 bg-copper/5 p-4 text-xs leading-5 text-copper">
          {t('governance.loginRequiredDescription')}
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <Stat icon={CheckCircle2} label={t('governance.panel.todayResolved')} value={stats?.todayResolvedCount ?? 0} tone="moss" />
            <Stat icon={Activity} label={t('governance.panel.openCount')} value={stats?.openCount ?? 0} tone="steel" />
            <Stat icon={AlertTriangle} label={t('governance.panel.emergencyCount')} value={stats?.emergencyCount ?? 0} tone="ochre" />
            <Stat icon={Clock} label={t('governance.panel.averageDuration')} value={stats?.averageResolutionMinutes == null ? '—' : formatGovernanceDuration(stats.averageResolutionMinutes, '—', t)} tone="copper" />
          </section>

          <section className="rounded-2xl border border-copper/10 bg-void/35 p-4">
            <p className="deck-label mb-4">{t('governance.panel.recentDistribution')}</p>
            <DistributionRow icon={AlertTriangle} label={t('governance.results.violation')} value={stats?.violationResolvedCount ?? 0} className="text-ochre" />
            <DistributionRow icon={CheckCircle2} label={t('governance.results.notViolation')} value={stats?.notViolationResolvedCount ?? 0} className="text-moss" />
          </section>

          {statsQuery.isError ? (
            <section className="rounded-2xl border border-ochre/20 bg-ochre/5 p-4 text-xs text-ochre">
              {t('governance.panel.syncFailed')}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export function GovernancePanel() {
  return (
    <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-copper/10 bg-void-deep xl:flex">
      <GovernancePanelContent />
    </aside>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: number | string; tone: 'moss' | 'steel' | 'ochre' | 'copper' }) {
  const toneClass = {
    moss: 'text-moss border-moss/10 bg-moss/5',
    steel: 'text-steel border-steel/10 bg-steel/5',
    ochre: 'text-ochre border-ochre/10 bg-ochre/5',
    copper: 'text-copper border-copper/10 bg-copper/5',
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <Icon className="h-4 w-4" />
      <p className="mt-3 font-mono text-xl font-bold">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-ink-muted">{label}</p>
    </div>
  );
}

function DistributionRow({ icon: Icon, label, value, className }: { icon: typeof Activity; label: string; value: number; className: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-muted/10 py-2 last:border-b-0">
      <span className={`flex items-center gap-2 text-xs ${className}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="font-mono text-sm text-ink-secondary">{value}</span>
    </div>
  );
}
