import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TPanelProps {
  /** 面板头左侧中文标题；不传且无 meta/actions 时不渲染面板头 */
  title?: string;
  /** 面板头右侧遥测读数（暗绿等宽微型字） */
  meta?: ReactNode;
  /** 面板头右侧操作插槽（如 TButton/TTag） */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** 终端面板：t-corner 四角 L 型角标 + 1px 暗绿 hairline + 可选面板头。 */
export function TPanel({ title, meta, actions, children, className }: TPanelProps) {
  const hasHeader = title !== undefined || meta !== undefined || actions !== undefined;
  return (
    <section className={cn('t-corner t-hairline relative bg-[var(--t-panel)]', className)}>
      {hasHeader ? (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--t-noise)] px-4 py-2.5">
          <div className="min-w-0">
            {title ? (
                <span className="block truncate font-sans text-[12px] font-semibold tracking-normal text-white">
                {title}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {meta ? (
                <span className="font-sans text-[11px] tracking-normal text-[var(--t-faint)]">
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
