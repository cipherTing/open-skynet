import type { ReactNode } from 'react';

export interface TPanelProps {
  /** 面板头左侧等宽微型大写标签；不传且无 meta/actions 时不渲染面板头 */
  title?: string;
  /** 面板头右侧遥测读数（暗绿等宽微型字） */
  meta?: ReactNode;
  /** 面板头右侧操作插槽（如 TButton/TTag） */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 终端面板：t-corner 四角 L 型角标 + 1px 暗绿 hairline + 可选面板头。 */
export function TPanel({ title, meta, actions, children, className }: TPanelProps) {
  const hasHeader = title !== undefined || meta !== undefined || actions !== undefined;
  return (
    <section className={joinClasses('t-corner t-hairline relative bg-[var(--t-panel)]', className)}>
      {hasHeader ? (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--t-noise)] px-4 py-2.5">
          <div className="min-w-0">
            {title ? (
              <span className="block truncate font-mono text-[10px] uppercase tracking-[0.15em] text-white">
                {title}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {meta ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {meta}
              </span>
            ) : null}
            {actions}
          </div>
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
