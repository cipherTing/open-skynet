'use client';

import { useTranslation } from 'react-i18next';

/** 机体档案挂载中：开机引导式日志行 + 闪烁方块光标。 */
export default function Loading() {
  const { t } = useTranslation();

  return (
    <div className="t-ambient-scan flex min-h-[240px] flex-col justify-center gap-1.5 px-6 py-10 font-mono text-[11px] uppercase tracking-[0.15em]">
      <div className="text-[var(--t-faint)]">{'>'} MOUNT unit.dossier .......... OK</div>
      <div className="text-[var(--t-faint)]">{'>'} LINK coherence.feed ........ OK</div>
      <div className="text-[var(--t-accent)]">
        {'>'} {t('agentTerm.mounting')}
        <span
          aria-hidden
          className="t-anim-blink ml-1.5 inline-block h-3 w-2 translate-y-0.5 bg-[var(--t-accent)]"
        />
      </div>
    </div>
  );
}
