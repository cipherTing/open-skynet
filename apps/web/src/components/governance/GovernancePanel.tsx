'use client';

import { Activity, AlertTriangle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { governanceApi } from '@/lib/api';
import { formatGovernanceDuration, isGovernanceAuthError } from './governance-format';

function formatInteger(value: number): string {
  return String(Math.round(value));
}

export function GovernancePanelContent() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading, isUnavailable: isAuthUnavailable } = useAuth();
  const statsQuery = useQuery({
    queryKey: ['governance', 'stats'],
    queryFn: () => governanceApi.stats(),
    enabled: !isAuthLoading && !isAuthUnavailable && isAuthenticated,
    refetchInterval: isAuthenticated && !isAuthUnavailable ? 60_000 : false,
    retry: (failureCount, error) => !isGovernanceAuthError(error) && failureCount < 2,
  });
  const stats = statsQuery.data;
  const requiresLogin = !isAuthLoading && !isAuthUnavailable && !isAuthenticated;

  return (
    <div className="skynet-auto-hide-scrollbar flex h-full min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-5">
      <section>
        <p className="deck-label">{t('governance.panel.title')}</p>
        <h2 className="mt-2 text-lg font-bold text-text-primary">{t('governance.panel.overview')}</h2>
        <p className="mt-1 text-xs leading-5 text-text-tertiary">{t('governance.panel.description')}</p>
      </section>

      {isAuthLoading ? (
        <section className="border border-border bg-surface-1 p-4 text-xs leading-5 text-text-tertiary">
          {t('governance.panel.syncing')}
        </section>
      ) : isAuthUnavailable ? (
        <section className="border border-danger/30 bg-surface-1 p-4 text-xs text-danger">
          {t('governance.panel.syncFailed')}
        </section>
      ) : requiresLogin ? (
        <section className="border border-border-accent bg-accent-muted p-4 text-xs leading-5 text-accent">
          {t('governance.loginRequiredDescription')}
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <Stat icon={CheckCircle2} label={t('governance.panel.todayResolved')} value={stats?.todayResolvedCount ?? 0} tone="accent" />
            <Stat icon={Activity} label={t('governance.panel.openCount')} value={stats?.openCount ?? 0} tone="info" />
            <Stat icon={AlertTriangle} label={t('governance.panel.emergencyCount')} value={stats?.emergencyCount ?? 0} tone="danger" />
            <Stat icon={Clock} label={t('governance.panel.averageDuration')} value={stats?.averageResolutionMinutes ?? '—'} format={(current) => formatGovernanceDuration(Math.round(current), '—', t)} tone="warning" />
          </section>

          <section className="border border-border bg-surface-1 p-4">
            <p className="deck-label mb-4">{t('governance.panel.recentDistribution')}</p>
            <DistributionRow icon={AlertTriangle} label={t('governance.results.violation')} value={stats?.violationResolvedCount ?? 0} className="text-danger" />
            <DistributionRow icon={CheckCircle2} label={t('governance.results.notViolation')} value={stats?.notViolationResolvedCount ?? 0} className="text-accent" />
            <DistributionRow icon={RotateCcw} label={t('governance.panel.correctionCount')} value={stats?.correctionCount ?? 0} className="text-warning" />
          </section>

          {statsQuery.isError ? (
            <section className="border border-danger/30 bg-surface-1 p-4 text-xs text-danger">
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
    <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-border-subtle bg-bg-app xl:flex">
      <GovernancePanelContent />
    </aside>
  );
}

function Stat({ icon: Icon, label, value, format, tone }: { icon: typeof Activity; label: string; value: number | string; format?: (value: number) => string; tone: 'accent' | 'info' | 'danger' | 'warning' }) {
  const toneClass = {
    accent: 'text-accent',
    info: 'text-info',
    danger: 'text-danger',
    warning: 'text-warning',
  }[tone];
  return (
    <div className="border border-border bg-surface-1 p-3">
      <Icon className={`h-4 w-4 ${toneClass}`} />
      <p className={`mt-3 font-mono text-xl font-bold tabular-nums ${toneClass}`}>
        {typeof value === 'number' ? (
          <TelemetryValue value={value} format={format ?? formatInteger} />
        ) : (
          value
        )}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-text-tertiary">{label}</p>
    </div>
  );
}

function DistributionRow({ icon: Icon, label, value, className }: { icon: typeof Activity; label: string; value: number; className: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-2 last:border-b-0">
      <span className={`flex items-center gap-2 text-xs ${className}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <TelemetryValue
        value={value}
        format={formatInteger}
        className="font-mono text-sm text-text-secondary"
      />
    </div>
  );
}
