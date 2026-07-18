'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

interface ScanlineRevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * 组件自带样式：2px 荧光绿水平扫描线 steps() 步进自上而下扫过，
 * 内容以 4 级 steps 透明度/位移逐段显现。全部 steps()，禁平滑缓动。
 */
const SCANLINE_CSS = `
.skynet-t-scanline {
  position: relative;
}
.skynet-t-scanline-content {
  opacity: 0;
  transform: translate3d(0, 10px, 0);
}
.skynet-t-scanline--on .skynet-t-scanline-content {
  animation: skynet-t-scanline-in 480ms steps(4, end) 340ms forwards;
}
.skynet-t-scanline--reduced .skynet-t-scanline-content {
  opacity: 1;
  transform: none;
  animation: none;
}
.skynet-t-scanline-beam {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: var(--t-accent);
  box-shadow: 0 0 8px rgba(173, 255, 47, 0.65);
  pointer-events: none;
  animation: skynet-t-scanline-sweep 420ms steps(18, end) forwards;
}
@keyframes skynet-t-scanline-sweep {
  0% { top: 0; opacity: 1; }
  85% { opacity: 1; }
  100% { top: calc(100% - 2px); opacity: 0; }
}
@keyframes skynet-t-scanline-in {
  0% { opacity: 0; transform: translate3d(0, 10px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
`;

/**
 * 扫描线显现：IntersectionObserver 检测进入视口后（threshold 0.2），
 * 一条 2px 荧光绿水平扫描线自上而下扫过容器，随后内容以 4 级 steps 显现。
 * 只触发一次。prefers-reduced-motion 时内容直接静态可见。
 */
export function ScanlineReveal({ children, className }: ScanlineRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (revealed || reducedMotion) return undefined;
    const node = containerRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed, reducedMotion]);

  const rootClass = [
    'skynet-t-scanline',
    revealed ? 'skynet-t-scanline--on' : '',
    reducedMotion ? 'skynet-t-scanline--reduced' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={containerRef} className={rootClass}>
      <style>{SCANLINE_CSS}</style>
      <div className="skynet-t-scanline-content">{children}</div>
      {revealed && !reducedMotion ? <div aria-hidden className="skynet-t-scanline-beam" /> : null}
    </div>
  );
}
