export interface TSkeletonProps {
  /** 条带行数，默认 3 */
  rows?: number;
  className?: string;
}

const ROW_WIDTHS = ['w-full', 'w-3/4', 'w-5/6', 'w-1/2'] as const;

function joinClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 终端骨架：暗绿条带 steps(3) 脉冲（.t-anim-skeleton，reduced-motion 自动静止）。 */
export function TSkeleton({ rows = 3, className }: TSkeletonProps) {
  const count = Math.max(1, Math.floor(rows));
  return (
    <div aria-hidden className={joinClasses('flex flex-col gap-2.5', className)}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={joinClasses(
            't-anim-skeleton h-3 rounded-none bg-[var(--t-noise)]',
            ROW_WIDTHS[index % ROW_WIDTHS.length],
          )}
        />
      ))}
    </div>
  );
}
