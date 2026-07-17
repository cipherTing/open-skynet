'use client';

import { Activity, AlertTriangle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { governanceApi } from '@/lib/api';
import { formatGovernanceDuration, isGovernanceAuthError } from './governance-format';

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function formatInteger(value: number): string {
  return String(Math.round(value));
}

/**
 * 治理遥测面板（右栏）：等宽 10px 标签 + TelemetryValue 微跳动 + 1px hairline 分区。
 * 禁止卡片套卡片：所有分区仅靠 hairline 与留白分层。
 */
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
    <div className="skynet-auto-hide-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
      <header className="flex flex-none items-center justify-between gap-2 border-b border-[#1A2E1A] px-4 py-2.5">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-white">
          {t('governance.panel.title')}
        </span>
        <span className="flex flex-none items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 ${
              statsQuery.isFetching ? 't-anim-blink bg-[#ADFF2F]' : 'bg-[#3A5A3A]'
            }`}
          />
          {t('sections.gov.panelCode')}
        </span>
      </header>

      <section className="border-b border-[#1A2E1A] px-4 py-4">
        <h2 className="text-sm font-bold text-white">{t('governance.panel.overview')}</h2>
        <p className="mt-1 text-[11px] leading-5 text-[#3A5A3A]">
          {t('governance.panel.description')}
        </p>
        {statsQuery.dataUpdatedAt > 0 ? (
          <p className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            SYNC
            <Timecode date={new Date(statsQuery.dataUpdatedAt)} />
          </p>
        ) : null}
      </section>

      {isAuthLoading ? (
        <section className="border-b border-[#1A2E1A] px-4 py-4 font-mono text-[11px] leading-5 tracking-[0.08em] text-[#3A5A3A]">
          {t('governance.panel.syncing')}
        </section>
      ) : isAuthUnavailable ? (
        <section className="border-b border-[#7F1D1D] px-4 py-4 font-mono text-[11px] tracking-[0.08em] text-[#EF4444]/80">
          {t('governance.panel.syncFailed')}
        </section>
      ) : requiresLogin ? (
        <section className="border-b border-[#1A2E1A] px-4 py-4 font-mono text-[11px] leading-5 tracking-[0.08em] text-[#ADFF2F]/80">
          {t('governance.loginRequiredDescription')}
        </section>
      ) : (
        <>
          <section className="border-b border-[#1A2E1A] p-3">
            <div className="grid grid-cols-2 gap-px border border-[#1A2E1A] bg-[#1A2E1A]">
              <PanelStat
                icon={CheckCircle2}
                label={t('governance.panel.todayResolved')}
                value={stats?.todayResolvedCount ?? 0}
                valueClass="text-[#ADFF2F]"
              />
              <PanelStat
                icon={Activity}
                label={t('governance.panel.openCount')}
                value={stats?.openCount ?? 0}
                valueClass="text-white"
              />
              <PanelStat
                icon={AlertTriangle}
                label={t('governance.panel.emergencyCount')}
                value={stats?.emergencyCount ?? 0}
                valueClass="text-[#EF4444]/90"
              />
              <PanelStat
                icon={Clock}
                label={t('governance.panel.averageDuration')}
                value={stats?.averageResolutionMinutes ?? null}
                format={(current) => formatGovernanceDuration(Math.round(current), '—', t)}
                valueClass="text-white/70"
              />
            </div>
          </section>

          <section className="px-4 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('governance.panel.recentDistribution')}
            </p>
            <div className="mt-3 divide-y divide-[#122012] border-y border-[#122012]">
              <DistributionRow
                icon={AlertTriangle}
                label={t('governance.results.violation')}
                value={stats?.violationResolvedCount ?? 0}
                labelClass="text-[#EF4444]/90"
              />
              <DistributionRow
                icon={CheckCircle2}
                label={t('governance.results.notViolation')}
                value={stats?.notViolationResolvedCount ?? 0}
                labelClass="text-[#ADFF2F]"
              />
              <DistributionRow
                icon={RotateCcw}
                label={t('governance.panel.correctionCount')}
                value={stats?.correctionCount ?? 0}
                labelClass="text-white/70"
              />
            </div>
          </section>

          {statsQuery.isError ? (
            <section className="border-t border-[#7F1D1D] px-4 py-4 font-mono text-[11px] tracking-[0.08em] text-[#EF4444]/80">
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
    <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-[#1A2E1A] bg-black xl:flex">
      <GovernancePanelContent />
    </aside>
  );
}

function PanelStat({
  icon: Icon,
  label,
  value,
  format,
  valueClass,
}: {
  icon: typeof Activity;
  label: string;
  value: number | null;
  format?: (value: number) => string;
  valueClass: string;
}) {
  return (
    <div className="bg-black p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-[#3A5A3A]" />
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#3A5A3A]">{label}</p>
      </div>
      <p className={joinClasses('mt-2 font-mono text-xl font-bold tabular-nums', valueClass)}>
        {typeof value === 'number' ? (
          <TelemetryValue value={value} format={format ?? formatInteger} />
        ) : (
          '—'
        )}
      </p>
    </div>
  );
}

function DistributionRow({
  icon: Icon,
  label,
  value,
  labelClass,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  labelClass: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={joinClasses('flex items-center gap-2 text-xs', labelClass)}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <TelemetryValue
        value={value}
        format={formatInteger}
        className="font-mono text-sm text-white/80"
      />
    </div>
  );
}
