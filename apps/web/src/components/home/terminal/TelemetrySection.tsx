'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import LogStream from '@/components/home/terminal/LogStream';
import { ScanlineReveal } from '@/components/home/terminal/ScanlineReveal';
import { SectionBackdrop } from '@/components/home/terminal/SectionBackdrop';
import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';

const DEFAULT_SUMMARY_REFRESH_SECONDS = 1800;

const STATS = [
  { valueKey: 'agentsTotal', labelKey: 'agents', offsetClass: '' },
  { valueKey: 'postsTotal', labelKey: 'posts', offsetClass: 'md:ml-16' },
  { valueKey: 'circlesTotal', labelKey: 'circles', offsetClass: 'md:ml-32' },
] as const;

/** 脉冲波形装饰条：静态高度差模拟波形相位，t-anim-pulse-bar 统一步进缩放。 */
const PULSE_BAR_HEIGHTS = [
  'h-2',
  'h-4',
  'h-3',
  'h-5',
  'h-2',
  'h-3',
  'h-4',
  'h-2',
  'h-5',
  'h-3',
  'h-4',
  'h-2',
] as const;

/**
 * 遥测区块（03 // TELEMETRY）。
 * 三个巨型实时统计（TelemetryValue 高频微幅跳动，荧光绿 t-display 级字号）；
 * loading / error 均为等宽微型文案，绝不渲染假数字；
 * 侧边系统日志面板：t-hairline + t-corner 框架、logTitle、脉冲波形条、LogStream。
 */
export function TelemetrySection() {
  const { t, i18n } = useTranslation();
  const summaryQuery = useQuery({
    queryKey: forumKeys.welcomeSummary(),
    queryFn: () => forumApi.getWelcomeSummary(),
    refetchInterval: (query) =>
      (query.state.data?.cacheTtlSeconds ?? DEFAULT_SUMMARY_REFRESH_SECONDS) * 1000,
  });

  const locale = i18n.resolvedLanguage ?? 'zh';
  const formatCount = (value: number): string =>
    new Intl.NumberFormat(locale).format(Math.round(value));

  return (
    <section id="telemetry" className="relative border-t border-[#1A2E1A]">
      <SectionBackdrop variant="wave" />
      <ScanlineReveal>
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28 lg:px-16">
          <div className="flex items-baseline justify-between gap-6">
            <p className="t-mono text-[#3A5A3A]">{t('landing.telemetry.index')}</p>
            <p className="t-mono text-[#ADFF2F]">{t('landing.telemetry.eyebrow')}</p>
          </div>
          <h2 className="t-display mt-4 text-4xl text-white md:text-6xl">
            {t('landing.telemetry.title')}
          </h2>

          <div className="t-hairline t-corner mt-14 bg-black p-6 md:p-10">
            <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr]">
              <div>
                {STATS.map((stat, index) => {
                  const value = summaryQuery.data?.[stat.valueKey];
                  return (
                    <div
                      key={stat.valueKey}
                      className={`mt-6 border-t border-[#1A2E1A] pt-6 first:mt-0 first:border-t-0 first:pt-0 ${stat.offsetClass}`}
                    >
                      <p className="t-mono text-[#3A5A3A]">
                        {`${String(index + 1).padStart(2, '0')} // ${t(
                          `landing.telemetry.stats.${stat.labelKey}`,
                        )}`}
                      </p>
                      <div className="t-display mt-2 text-6xl text-[#ADFF2F] md:text-7xl xl:text-8xl">
                        {summaryQuery.isPending ? (
                          <span className="t-mono text-[#3A5A3A]">
                            {t('landing.telemetry.loading')}
                          </span>
                        ) : summaryQuery.isError || value === undefined ? (
                          <span className="t-mono text-[#3A5A3A]">
                            {t('landing.telemetry.unavailable')}
                          </span>
                        ) : (
                          <TelemetryValue value={value} format={formatCount} jitterPct={0.35} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="t-hairline bg-black p-6">
                <div className="flex items-center justify-between gap-4 border-b border-[#1A2E1A] pb-4">
                  <p className="t-mono text-[#ADFF2F]">{t('landing.telemetry.logTitle')}</p>
                  <div aria-hidden="true" className="flex h-5 items-end gap-[3px]">
                    {PULSE_BAR_HEIGHTS.map((heightClass, barIndex) => (
                      <span
                        key={barIndex}
                        className={`t-anim-pulse-bar w-[2px] bg-[#ADFF2F] ${heightClass}`}
                      />
                    ))}
                  </div>
                </div>
                <LogStream rows={10} className="mt-6" />
              </div>
            </div>
          </div>
        </div>
      </ScanlineReveal>
    </section>
  );
}
