'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

interface TelemetryValueProps {
  value: number;
  format?: (value: number) => string;
  /** 抖动幅度（百分比），显示值在 value ± jitterPct% 内非周期跳动。默认 0.02（即 0.02%）。 */
  jitterPct?: number;
  className?: string;
}

function defaultFormat(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 遥测数字：以 150–300ms 随机间隔做非周期微幅跳动。
 * - 基准值以 lerp 平滑跟随最新 value；
 * - 显示值 = 基准 × (1 ± jitterPct% 随机)；
 * - tabular-nums + inline-block + nowrap 防 reflow；
 * - prefers-reduced-motion 时静态展示格式化值。
 */
export function TelemetryValue({ value, format, jitterPct = 0.02, className }: TelemetryValueProps) {
  const reducedMotion = usePrefersReducedMotion();
  const formatRef = useRef(format);
  const valueRef = useRef(value);
  const baseRef = useRef(value);
  const [display, setDisplay] = useState(() => (format ?? defaultFormat)(value));

  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let cancelled = false;
    let timer = 0;

    const tick = () => {
      if (cancelled) return;
      const target = valueRef.current;
      baseRef.current += (target - baseRef.current) * 0.4;
      const amplitude = baseRef.current * (jitterPct / 100);
      const jittered = baseRef.current + amplitude * (Math.random() * 2 - 1);
      const formatValue = formatRef.current ?? defaultFormat;
      setDisplay(formatValue(jittered));
      timer = window.setTimeout(tick, 150 + Math.random() * 150);
    };

    timer = window.setTimeout(tick, 150 + Math.random() * 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reducedMotion, jitterPct]);

  const shown = reducedMotion ? (format ?? defaultFormat)(value) : display;
  const rootClass = [
    'inline-block whitespace-nowrap [font-variant-numeric:tabular-nums]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={rootClass}>{shown}</span>;
}
