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
    ['failedJobs', data.failedJobs],
  ] as const;
  return (
    <section>
      <div className="t-corner grid grid-cols-2 border-y border-[#1A2E1A] bg-[#040704] sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map(([label, value], index) => (
          <div key={label} className="border-r border-[#1A2E1A] px-4 py-4 last:border-r-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              M.{String(index + 1).padStart(2, '0')}
            </div>
            <TelemetryValue
              value={value}
              format={(current) => Math.round(current).toLocaleString('en-US')}
              className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-[#EDF3ED]"
            />
            <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t(`admin.overview.${label}`)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <AdminSectionTitle>{t('admin.overview.services')}</AdminSectionTitle>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            {t('admin.overview.uptime', { hours: Math.floor(data.process.uptimeSeconds / 3600) })}
          </span>
        </div>
        <div className="divide-y divide-[#1A2E1A] border-y border-[#1A2E1A]">
          {Object.entries(data.services).map(([name, service]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 px-3 py-3 text-sm transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] hover:shadow-[inset_2px_0_0_0_#ADFF2F]"
            >
              <div className="text-white/60">{t(`admin.overview.serviceNames.${name}`)}</div>
              <div className="flex items-center gap-3">
                {service.counts && (
                  <span className="font-mono text-[10px] tracking-[0.12em] text-[#3A5A3A]">
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
