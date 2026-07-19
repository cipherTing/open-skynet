'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrambleText } from '@/components/home/terminal/ScrambleText';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';
import { ProjectGithubLink } from '@/components/ui/ProjectGithubLink';

type TerminalSectionId = 'manifesto' | 'systems' | 'telemetry' | 'protocol';

interface TerminalFrameProps {
  activeSection?: TerminalSectionId;
}

const NAV_ITEMS: readonly { id: TerminalSectionId; href: string }[] = [
  { id: 'manifesto', href: '#manifesto' },
  { id: 'systems', href: '#systems' },
  { id: 'telemetry', href: '#telemetry' },
  { id: 'protocol', href: '#protocol' },
];

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * 终端 HUD 框架层：fixed 定位，不随内容滚动。
 * 顶栏（logo / 锚点导航 / ONLINE 状态点 / UTC 时钟）、左右竖排边轨、
 * 底栏（坐标 / 项目地址 / 滚动提示与进度）与四角 L 型角标。
 * 容器本身不拦截指针，仅可交互子元素恢复 pointer-events。
 */
export function TerminalFrame({ activeSection }: TerminalFrameProps) {
  const { t } = useTranslation();
  const now = useUtcNow(1000);
  const [scrollPct, setScrollPct] = useState(0);

  // 页面滚动发生在主滚动容器（main）内，scroll 事件不冒泡，
  // 故在 window 上以 capture 模式监听，捕获任意后代滚动容器的滚动。
  useEffect(() => {
    const compute = (target: EventTarget | null): number => {
      const el =
        target instanceof Element && target.scrollHeight > target.clientHeight
          ? target
          : (document.scrollingElement ?? document.documentElement);
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return 0;
      return Math.min(100, Math.max(0, (el.scrollTop / max) * 100));
    };
    const onScroll = (event: Event) => setScrollPct(compute(event.target));
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const clock = now
    ? `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`
    : '--:--:--';

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      {/* 顶栏 */}
      <header className="absolute inset-x-0 top-0 bg-[rgba(0,0,0,0.72)] backdrop-blur-md">
        <div className="flex h-12 items-center justify-between gap-4 px-4 md:px-6">
          <a href="#hero" className="pointer-events-auto flex items-center gap-3">
            <span className="t-display text-sm text-[var(--t-ink)]">SKYNET</span>
            <span className="t-mono hidden text-[var(--t-faint)] lg:inline">
              {t('landing.nav.logoTag')}
            </span>
          </a>
          <nav className="pointer-events-auto hidden items-center gap-6 md:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? 'true' : undefined}
                  className={`t-mono transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                    isActive
                      ? 'text-[var(--t-accent)]'
                      : 'text-[var(--t-sub)] hover:text-[var(--t-ink)]'
                  }`}
                >
                  <ScrambleText text={t(`landing.nav.${item.id}`)} />
                </a>
              );
            })}
          </nav>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <span className="t-anim-blink h-1.5 w-1.5 bg-[var(--t-accent)]" aria-hidden />
              <span className="t-mono hidden text-[var(--t-accent)] sm:inline">
                {t('landing.meta.status')}
              </span>
            </span>
            <span className="t-mono tabular-nums text-[var(--t-ink)]">{clock}</span>
          </div>
        </div>
        <div className="h-px w-full bg-[var(--t-noise)]" aria-hidden />
      </header>

      {/* 左 / 右竖排边轨 */}
      <aside className="absolute left-3 top-1/2 hidden -translate-y-1/2 md:block" aria-hidden>
        <span className="t-mono text-[var(--t-faint)] [writing-mode:vertical-rl]">
          {t('landing.meta.railLeft')}
        </span>
      </aside>
      <aside className="absolute right-3 top-1/2 hidden -translate-y-1/2 md:block" aria-hidden>
        <span className="t-mono text-[var(--t-faint)] [writing-mode:vertical-rl]">
          {t('landing.meta.railRight')}
        </span>
      </aside>

      {/* 底栏 */}
      <footer className="absolute inset-x-0 bottom-0 bg-[rgba(0,0,0,0.72)] backdrop-blur-md">
        <div className="h-px w-full bg-[var(--t-noise)]" aria-hidden />
        <div className="grid h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 md:px-6">
          <span className="t-mono hidden truncate text-[var(--t-faint)] md:block">
            {t('landing.meta.coordinates')}
          </span>
          <ProjectGithubLink className="pointer-events-auto justify-self-center t-mono text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)] focus-visible:text-[var(--t-accent)]" />
          <div className="hidden min-w-0 items-center justify-end gap-4 sm:flex">
            <span className="t-mono hidden truncate text-[var(--t-faint)] lg:inline">
              {t('landing.meta.scrollHint')}
            </span>
            <span className="t-mono shrink-0 tabular-nums text-[var(--t-ink)]">
              {Math.round(scrollPct).toString().padStart(3, '0')}%
            </span>
          </div>
        </div>
      </footer>

      {/* 四角 L 型角标 */}
      <div className="absolute inset-3" aria-hidden>
        <div className="t-corner h-full w-full" />
      </div>
    </div>
  );
}
