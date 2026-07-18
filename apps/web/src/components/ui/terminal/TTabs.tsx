export interface TTabItem {
  id: string;
  label: string;
}

export interface TTabsProps {
  items: TTabItem[];
  /** 当前激活项 id（受控） */
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * 终端受控 tabs：底部 2px 荧光绿指示条 steps 硬切跳动（禁滑动动画）。
 */
export function TTabs({ items, active, onChange, className }: TTabsProps) {
  return (
    <div
      role="tablist"
      className={joinClasses('flex items-stretch border-b border-[var(--t-noise)]', className)}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={joinClasses(
              'relative px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em]',
              'transition-colors duration-100 [transition-timing-function:steps(2,end)]',
              'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]',
              isActive ? 'text-white' : 'text-[var(--t-sub)] hover:text-white/85',
            )}
          >
            {item.label}
            <span
              aria-hidden
              className={joinClasses(
                'absolute inset-x-0 -bottom-px h-[2px] bg-[var(--t-accent)]',
                'transition-opacity duration-150 [transition-timing-function:steps(2,end)]',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
