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
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
        {chapter}
      </span>
      <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-[var(--t-faint)]">{'//'}</span>
      <span className="shrink-0 text-xs font-bold text-white">{title}</span>
      <span aria-hidden className="h-px min-w-6 flex-1 bg-[var(--t-noise)]" />
    </div>
  );
}

export type GovernanceRailTone = 'pending' | 'closed' | 'admin';

const RAIL_TONE_CLASS: Record<GovernanceRailTone, string> = {
  pending: 'bg-[var(--t-accent)]',
  closed: 'bg-[var(--t-faint)]',
  admin: 'bg-[var(--t-hazard)]/60',
};

/** 告警色条：案件/结果条目左侧 2px 分级色条（待投票=荧光绿、已结案=暗绿、管理员介入=红系低饱和）。 */
export function GovernanceAlertRail({ tone }: { tone: GovernanceRailTone }) {
  return (
    <span
      aria-hidden
      className={joinClasses('absolute bottom-0 left-0 top-0 w-[2px]', RAIL_TONE_CLASS[tone])}
    />
  );
}

export type GovernanceVerdictTone = 'violation' | 'notViolation' | 'pending' | 'emergency' | 'admin';

const VERDICT_STAMP_CLASS: Record<
  GovernanceVerdictTone,
  { outer: string; inner: string; text: string }
> = {
  violation: {
    outer: 'border-[var(--t-hazard)]/70',
    inner: 'border-[var(--t-hazard)]/35',
    text: 'text-[var(--t-hazard)]',
  },
  notViolation: {
    outer: 'border-[var(--t-accent)]/70',
    inner: 'border-[var(--t-accent)]/35',
    text: 'text-[var(--t-accent)]',
  },
  pending: {
    outer: 'border-[var(--t-accent)]/70',
    inner: 'border-[var(--t-accent)]/35',
    text: 'text-[var(--t-accent)]',
  },
  emergency: {
    outer: 'border-[var(--t-signal)]/80',
    inner: 'border-[var(--t-signal)]/40',
    text: 'text-[var(--t-signal)]',
  },
  admin: {
    outer: 'border-[var(--t-hazard)]/70',
    inner: 'border-[var(--t-hazard)]/35',
    text: 'text-[var(--t-hazard)]/90',
  },
};

/**
 * 状态印章：直角双层边框章（外 1px + 内 1px），等宽大写。
 * animate=true 时挂载触发一次 t-glitch-shift steps 盖印震动（reduced-motion 自动静止）；
 * 列表批量行内请传 animate={false}，避免整列同时抖动。
 */
export function GovernanceVerdictStamp({
  tone,
  label,
  animate = true,
  className,
}: {
  tone: GovernanceVerdictTone;
  label: string;
  animate?: boolean;
  className?: string;
}) {
  const stamp = VERDICT_STAMP_CLASS[tone];
  return (
    <span
      className={joinClasses(
        'inline-flex border p-[2px]',
        stamp.outer,
        animate && 'motion-safe:[animation:t-glitch-shift_0.3s_steps(1)_1]',
        className,
      )}
    >
      <span
        className={joinClasses(
          'inline-flex items-center gap-1.5 whitespace-nowrap border px-2 py-1',
          'font-mono text-[10px] font-bold uppercase leading-none tracking-[0.2em]',
          stamp.inner,
          stamp.text,
        )}
      >
        {label}
      </span>
    </span>
  );
}

function SegmentTrack({
  filled,
  total,
  tone,
}: {
  filled: number;
  total: number;
  tone: 'accent' | 'dim';
}) {
  const litClass = tone === 'accent' ? 'bg-[var(--t-accent)]' : 'bg-[var(--t-faint)]';
  const partialClass = tone === 'accent' ? 't-vote-cell-partial' : 't-vote-cell-partial--dim';
  if (total <= 0) {
    return (
      <div aria-hidden className="flex h-[3px] items-stretch">
        <span className="h-full flex-1 bg-[var(--t-noise2)]" />
      </div>
    );
  }
  const cellCount = Math.ceil(total);
  const fullCells = Math.floor(filled);
  const hasPartialCell = filled - fullCells > 0.01;
  return (
    <div aria-hidden className="flex h-[3px] items-stretch gap-px">
      {Array.from({ length: cellCount }, (_, index) => {
        const cellClass =
          index < fullCells
            ? litClass
            : index === fullCells && hasPartialCell
              ? partialClass
              : 'bg-[var(--t-noise2)]';
        return <span key={index} className={joinClasses('h-full flex-1', cellClass)} />;
      })}
    </div>
  );
}

/**
 * 投票对比条：赞成/反对两行直角段码进度条（荧光绿 vs 暗绿）。
 * 整票 = 1 格：每行总格数 = ceil(本案总票数)，整票部分点亮整格；
 * 加权产生的小数票追加一个半亮格（t-vote-cell-partial），格数始终跟随实际票数；
 * 总票数为 0 时渲染一条全静音基线。数字为静态等宽文本，不跳动。
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
  return (
    <div
      className={joinClasses('grid gap-2', className)}
      role="img"
      aria-label={`${violationLabel} ${violation} / ${notViolationLabel} ${notViolation}`}
    >
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
            {violationLabel}
          </span>
          <span className="inline-block whitespace-nowrap font-mono text-[11px] tabular-nums text-[var(--t-accent)]">
            {violation}
          </span>
        </div>
        <SegmentTrack filled={violation} total={total} tone="accent" />
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
            {notViolationLabel}
          </span>
          <span className="inline-block whitespace-nowrap font-mono text-[11px] tabular-nums text-[var(--t-sub)]">
            {notViolation}
          </span>
        </div>
        <SegmentTrack filled={notViolation} total={total} tone="dim" />
      </div>
    </div>
  );
}
