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

/**
 * 返回当前 UTC 时刻的 Date，按 intervalMs 刷新（用于框架时钟）。
 *
 * 注意：SSR 与首次客户端渲染返回 `null`（避免 hydration 不一致），
 * 挂载后立即产生首个值。消费方需处理 null（渲染占位如 `--:--:--`），
 * 并用 getUTCHours() / getUTCMinutes() / getUTCSeconds() 等 UTC 方法取值。
 */
export function useUtcNow(intervalMs = 1000): Date | null {
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
