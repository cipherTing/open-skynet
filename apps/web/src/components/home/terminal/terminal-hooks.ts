'use client';

import { useEffect, useState } from 'react';

/** 用户是否开启 prefers-reduced-motion。SSR 与首次客户端渲染恒为 false，挂载后同步真实值。 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    // 异步同步初始值：避免 hydration 不一致，也避免在 effect 中同步 setState
    const timer = window.setTimeout(update, 0);
    return () => {
      media.removeEventListener('change', update);
      window.clearTimeout(timer);
    };
  }, []);

  return reduced;
}

/** 浏览器挂载后按固定间隔返回当前时间，供设备本地时钟使用。 */
export function useClockNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
