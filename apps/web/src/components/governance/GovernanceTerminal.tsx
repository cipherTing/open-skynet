import { TelemetryValue } from '@/components/home/terminal/TelemetryValue';

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 章节标记标题：CH.01 // 标题 + 1px 装饰横线。编号荧光绿、标题纯白。 */
export function GovernanceChapterTitle({
  chapter,
  title,
  className,
}: {
  chapter: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={joinClasses('flex items-center gap-2', className)}>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F]">
        {chapter}
      </span>
      <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-[#3A5A3A]">{'//'}</span>
      <span className="shrink-0 text-xs font-bold text-white">{title}</span>
      <span aria-hidden className="h-px min-w-6 flex-1 bg-[#1A2E1A]" />
    </div>
  );
}

export type GovernanceRailTone = 'pending' | 'closed' | 'admin';

const RAIL_TONE_CLASS: Record<GovernanceRailTone, string> = {
  pending: 'bg-[#ADFF2F]',
  closed: 'bg-[#3A5A3A]',
  admin: 'bg-[#EF4444]/60',
};

/** 告警色条：案件/结果条目左侧 3px 分级色条（待投票=荧光绿、已结案=暗绿、管理员介入=红系低饱和）。 */
export function GovernanceAlertRail({ tone }: { tone: GovernanceRailTone }) {
  return (
    <span
      aria-hidden
      className={joinClasses('absolute bottom-0 left-0 top-0 w-[3px]', RAIL_TONE_CLASS[tone])}
    />
  );
}

const COMPARE_SEGMENTS = 20;

function SegmentTrack({ filled, tone }: { filled: number; tone: 'accent' | 'dim' }) {
  const litClass = tone === 'accent' ? 'bg-[#ADFF2F]' : 'bg-[#3A5A3A]';
  return (
    <div aria-hidden className="flex h-px items-stretch gap-px">
      {Array.from({ length: COMPARE_SEGMENTS }, (_, index) => (
        <span
          key={index}
          className={joinClasses('h-full flex-1', index < filled ? litClass : 'bg-[#122012]')}
        />
      ))}
    </div>
  );
}

/**
 * 投票对比条：赞成/反对两行直角 1px 段码进度条（荧光绿 vs 暗绿）。
 * 每行按占总票数的比例点亮 20 段刻度。
 */
export function GovernanceVoteCompare({
  violation,
  notViolation,
  violationLabel,
  notViolationLabel,
  className,
}: {
  violation: number;
  notViolation: number;
  violationLabel: string;
  notViolationLabel: string;
  className?: string;
}) {
  const total = violation + notViolation;
  const violationFilled =
    total > 0 ? Math.round((violation / total) * COMPARE_SEGMENTS) : 0;
  const notViolationFilled =
    total > 0 ? Math.round((notViolation / total) * COMPARE_SEGMENTS) : 0;
  return (
    <div
      className={joinClasses('grid gap-2', className)}
      role="img"
      aria-label={`${violationLabel} ${violation} / ${notViolationLabel} ${notViolation}`}
    >
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-tertiary">
            {violationLabel}
          </span>
          <TelemetryValue
            value={violation}
            format={(current) => String(Math.round(current))}
            className="font-mono text-[11px] text-[#ADFF2F]"
          />
        </div>
        <SegmentTrack filled={violationFilled} tone="accent" />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-tertiary">
            {notViolationLabel}
          </span>
          <TelemetryValue
            value={notViolation}
            format={(current) => String(Math.round(current))}
            className="font-mono text-[11px] text-[#3A5A3A]"
          />
        </div>
        <SegmentTrack filled={notViolationFilled} tone="dim" />
      </div>
    </div>
  );
}
