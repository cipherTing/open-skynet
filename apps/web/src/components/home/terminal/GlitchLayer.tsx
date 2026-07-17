'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SKYNET_GLITCH_EVENT } from '@/components/home/terminal/glitch-bus';
import { usePrefersReducedMotion } from '@/components/home/terminal/terminal-hooks';

interface GlitchLayerProps {
  children: ReactNode;
  className?: string;
}

const SHAKE_CLASS = 'skynet-t-glitch-shake';
const GLITCH_DURATION_MS = 140;

/**
 * 组件自带样式：100ms steps() 高频微幅位移 + 三条荧光绿描边伪切片
 * 以 clip-path 纵向切割闪烁。全部 keyframes 用 steps()，禁平滑缓动。
 */
const GLITCH_CSS = `
.skynet-t-glitch {
  position: relative;
}
.skynet-t-glitch-shake {
  animation: skynet-t-glitch-shake 100ms steps(6, end) both;
}
@keyframes skynet-t-glitch-shake {
  0% { transform: translate3d(0, 0, 0); }
  20% { transform: translate3d(-2px, 1px, 0); }
  40% { transform: translate3d(2px, -1px, 0); }
  60% { transform: translate3d(-1px, -1px, 0); }
  80% { transform: translate3d(1px, 1px, 0); }
  100% { transform: translate3d(0, 0, 0); }
}
.skynet-t-glitch-slices {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 20;
}
.skynet-t-glitch-slice {
  position: absolute;
  left: -2%;
  width: 104%;
  height: 18%;
  border-top: 1px solid #ADFF2F;
  border-bottom: 1px solid #ADFF2F;
  background: rgba(173, 255, 47, 0.06);
  opacity: 0;
  animation: skynet-t-glitch-slice 100ms steps(3, end) both;
}
.skynet-t-glitch-slice--a { top: 12%; animation-delay: 0ms; }
.skynet-t-glitch-slice--b { top: 46%; animation-delay: 20ms; }
.skynet-t-glitch-slice--c { top: 78%; animation-delay: 40ms; }
@keyframes skynet-t-glitch-slice {
  0% {
    opacity: 0;
    transform: translate3d(-6px, 0, 0);
    clip-path: inset(0 0 82% 0);
  }
  30% {
    opacity: 1;
    transform: translate3d(5px, 0, 0);
    clip-path: inset(28% 0 40% 0);
  }
  60% {
    opacity: 0.8;
    transform: translate3d(-3px, 0, 0);
    clip-path: inset(62% 0 12% 0);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, 0, 0);
    clip-path: inset(0 0 100% 0);
  }
}
`;

/**
 * Glitch 承接层：监听 `skynet:glitch` 事件（见 glitch-bus.ts 的 emitGlitch），
 * 对包裹容器施加约 100ms 微震 + clip-path 纵向切割闪烁层，结束后完全复位。
 * 事件可密集重触发（重新起播动画）。prefers-reduced-motion 时完全降级为静止。
 */
export function GlitchLayer({ children, className }: GlitchLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);
  const [glitchTick, setGlitchTick] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const onGlitch = () => {
      if (reducedMotion) return;
      window.clearTimeout(timerRef.current);
      // key 递增使切片层重挂载，动画重新起播
      setGlitchTick((tick) => tick + 1);
      const node = containerRef.current;
      if (node) {
        // reflow 技巧重启容器抖动动画，不 remount children
        node.classList.remove(SHAKE_CLASS);
        void node.offsetWidth;
        node.classList.add(SHAKE_CLASS);
      }
      timerRef.current = window.setTimeout(() => {
        containerRef.current?.classList.remove(SHAKE_CLASS);
        setGlitchTick(0);
      }, GLITCH_DURATION_MS);
    };

    window.addEventListener(SKYNET_GLITCH_EVENT, onGlitch);
    return () => {
      window.removeEventListener(SKYNET_GLITCH_EVENT, onGlitch);
      window.clearTimeout(timerRef.current);
    };
  }, [reducedMotion]);

  const rootClass = ['skynet-t-glitch', className].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={rootClass}>
      <style>{GLITCH_CSS}</style>
      {children}
      {glitchTick > 0 ? (
        <span key={glitchTick} aria-hidden className="skynet-t-glitch-slices">
          <span className="skynet-t-glitch-slice skynet-t-glitch-slice--a" />
          <span className="skynet-t-glitch-slice skynet-t-glitch-slice--b" />
          <span className="skynet-t-glitch-slice skynet-t-glitch-slice--c" />
        </span>
      ) : null}
    </div>
  );
}
