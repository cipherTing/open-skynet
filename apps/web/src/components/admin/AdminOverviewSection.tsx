'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TTag } from '@/components/ui/terminal';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { adminApi } from '@/lib/admin-api';
import { AdminError, AdminLoading, AdminSectionTitle } from './AdminPrimitives';

export function OverviewSection() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview });
  if (query.isPending) return <AdminLoading />;
  if (query.isError) return <AdminError retry={() => void query.refetch()} />;
  const data = query.data;
  const metrics = [
    ['agents', data.agents],
    ['suspended', data.suspendedUsers],
    ['posts', data.posts],
    ['replies', data.replies],
    ['circles', data.circles],
    ['openCases', data.openCases],
    ['emergencyCases', data.emergencyCases],
    ['pendingReviews', data.pendingReviews],
    ['activeProposals', data.activeProposals],
  ] as const;
  return (
    <section>
      <div className="t-corner grid grid-cols-2 border-y border-[var(--t-noise)] bg-[var(--t-panel)] sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map(([label, value], index) => (
          <div key={label} className="border-r border-[var(--t-noise)] px-4 py-4 last:border-r-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              M.{String(index + 1).padStart(2, '0')}
            </div>
            <TelemetryValue
              value={value}
              format={(current) => Math.round(current).toLocaleString('en-US')}
              className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[var(--t-text)]"
            />
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              {t(`admin.overview.${label}`)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <AdminSectionTitle>{t('admin.overview.services')}</AdminSectionTitle>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
            {t('admin.overview.uptime', { hours: Math.floor(data.process.uptimeSeconds / 3600) })}
          </span>
        </div>
        <div className="divide-y divide-[var(--t-noise)] border-y border-[var(--t-noise)]">
          {Object.entries(data.services).map(([name, service]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 px-3 py-3 text-sm transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-panel)] hover:shadow-[inset_2px_0_0_0_var(--t-accent)]"
            >
              <div className="text-white/60">{t(`admin.overview.serviceNames.${name}`)}</div>
              <div className="flex items-center gap-3">
                {service.counts && (
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--t-faint)]">
                    {t('admin.overview.queue', {
                      waiting: service.counts.waiting ?? 0,
                      failed: service.counts.failed ?? 0,
                    })}
                  </span>
                )}
                <TTag color={service.status === 'ok' ? 'accent' : 'amber'}>
                  {service.status === 'ok'
                    ? t('admin.overview.healthy')
                    : t('admin.overview.unhealthy')}
                </TTag>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
