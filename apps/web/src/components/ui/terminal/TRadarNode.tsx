export interface TRadarNodeProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 可选旁侧等宽标签，同时作为无障碍名称 */
  label?: string;
  disabled?: boolean;
  className?: string;
}

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * 雷达节点勾选控件：环形 + 中心点，激活荧光绿点亮，禁用暗绿空心。
 * 原生 button + role="checkbox"，Space/Enter 键盘可达。
 */
export function TRadarNode({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: TRadarNodeProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={joinClasses(
        'inline-flex items-center gap-2.5 rounded-none bg-transparent',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ADFF2F]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      <span
        aria-hidden
        className={joinClasses(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          'transition-[border-color] duration-100 [transition-timing-function:steps(2,end)]',
          checked ? 'border-[#ADFF2F]' : 'border-[#3A5A3A]',
        )}
      >
        <span
          className={joinClasses(
            'h-1.5 w-1.5 rounded-full',
            'transition-colors duration-100 [transition-timing-function:steps(2,end)]',
            checked ? 'bg-[#ADFF2F]' : 'bg-transparent',
          )}
        />
      </span>
      {label ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/85">
          {label}
        </span>
      ) : null}
    </button>
  );
}
