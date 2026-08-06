import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TEmptyProps {
  /** 中文阅读字体提示文案（由调用方提供，Kit 不放静态文案） */
  message: ReactNode;
  /** 可选装饰插槽（氛围层/图形装饰，渲染在提示上方） */
  decoration?: ReactNode;
  className?: string;
}

/** 终端空态：虚线暗绿框 + 可读提示 + 可选装饰插槽。 */
export function TEmpty({ message, decoration, className }: TEmptyProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-3',
        'rounded-none border border-dashed border-[var(--t-noise)] px-6 py-10 text-center',
        className,
      )}
    >
      {decoration}
      <div className="font-sans text-[12px] leading-5 text-[var(--t-sub)]">
        {message}
      </div>
    </div>
  );
}
