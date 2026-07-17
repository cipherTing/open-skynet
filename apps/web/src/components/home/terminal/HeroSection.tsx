'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AsciiCoreCanvas from '@/components/home/terminal/AsciiCoreCanvas';
import { ScrambleText } from '@/components/home/terminal/ScrambleText';
import { emitGlitch } from '@/components/home/terminal/glitch-bus';

interface HeroSectionProps {
  isAuthenticated: boolean;
  onConnectAgent: () => void;
}

/** 元数据行：暗绿为主，末段关键词（`//` 之后或末尾 token）荧光绿。 */
function MetaLine({ text, className }: { text: string; className?: string }) {
  const separator = text.includes(' // ') ? ' // ' : ' ';
  const index = text.lastIndexOf(separator);
  if (index < 0) {
    return <span className={`t-mono text-[var(--t-dim)] ${className ?? ''}`}>{text}</span>;
  }
  const head = text.slice(0, index);
  const tail = text.slice(index);
  return (
    <span className={`t-mono ${className ?? ''}`}>
      <span className="text-[var(--t-dim)]">{head}</span>
      <span className="text-[var(--t-accent)]">{tail}</span>
    </span>
  );
}

const CTA_BASE =
  't-mono px-7 py-3.5 transition-colors duration-100 [transition-timing-function:steps(2,end)]';

/** 入口门户：直角黑底面板 + 四角 L 型角标，首屏全部行动入口收进这里。 */
function HeroPortal({ isAuthenticated, onConnectAgent }: HeroSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="relative w-full border border-[var(--t-dim)] bg-black/85 px-6 py-8 md:px-10 md:py-12">
      {/* 四角 L 型角标 */}
      <span
        aria-hidden
        className="absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-[var(--t-accent)]"
      />
      <span
        aria-hidden
        className="absolute -right-px -top-px h-4 w-4 border-r-2 border-t-2 border-[var(--t-accent)]"
      />
      <span
        aria-hidden
        className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-[var(--t-accent)]"
      />
      <span
        aria-hidden
        className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-[var(--t-accent)]"
      />

      <p className="t-mono text-[10px] text-[var(--t-dim)]">{t('landing.hero.portalLabel')}</p>

      <Link
        href="/workspace"
        onClick={() => emitGlitch()}
        className="mt-6 block border border-[var(--t-accent)] px-6 py-6 text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)] hover:text-black md:px-8 md:py-8"
      >
        <ScrambleText
          className="t-display block text-[clamp(2.5rem,4.5vw,4.5rem)]"
          text={t('landing.hero.ctaPrimary')}
        />
      </Link>

      {isAuthenticated ? (
        <button
          type="button"
          onClick={onConnectAgent}
          className={`${CTA_BASE} mt-4 block w-full border border-[var(--t-dim)] text-center text-[var(--t-ink)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]`}
        >
          <ScrambleText text={t('landing.hero.ctaSecondary')} />
        </button>
      ) : (
        <Link
          href="/auth?mode=register"
          className={`${CTA_BASE} mt-4 block w-full border border-[var(--t-dim)] text-center text-[var(--t-ink)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]`}
        >
          <ScrambleText text={t('landing.hero.ctaRegister')} />
        </Link>
      )}
    </div>
  );
}

/** 首屏：ASCII 神经核心背景 + 四角元数据 + 巨型标题 + 右侧入口门户。 */
export function HeroSection({ isAuthenticated, onConnectAgent }: HeroSectionProps) {
  const { t } = useTranslation();

  return (
    <section id="hero" className="relative min-h-svh overflow-hidden">
      {/* 背景层：点阵网格 + ASCII 神经核心（偏右） */}
      <div className="t-dotgrid absolute inset-0" aria-hidden />
      <div className="absolute inset-y-0 right-0 h-full w-full md:w-[62%]" aria-hidden>
        <AsciiCoreCanvas className="h-full w-full opacity-40 md:opacity-80" />
      </div>

      {/* 内容层 */}
      <div className="relative z-10 flex min-h-svh flex-col justify-between px-6 pb-24 pt-20 md:px-12 md:pt-24">
        {/* 顶部元数据块 */}
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1">
            <MetaLine text={t('landing.meta.fileNo')} />
            <MetaLine text={t('landing.meta.classification')} />
            <MetaLine className="hidden sm:inline" text={t('landing.meta.version')} />
          </div>
        </div>

        {/* 主体：左侧巨型标题区 + 右侧入口门户（桌面端独立列，门户压在神经核心画布之上） */}
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,38%)]">
          <div className="max-w-full">
            <p className="t-mono text-[var(--t-accent)]">{t('landing.hero.kicker')}</p>
            <h1 className="t-display mt-4 text-[clamp(4rem,14vw,12rem)] text-[var(--t-ink)]">
              {t('landing.hero.title')}
            </h1>
            <p className="t-serif-accent mt-4 text-lg md:text-2xl">{t('landing.hero.accent')}</p>
            <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/85 md:text-base">
              {t('landing.hero.subtitle')}
            </p>

            {/* 移动端门户：堆在标题区下方、全宽 */}
            <div className="mt-10 md:hidden">
              <HeroPortal isAuthenticated={isAuthenticated} onConnectAgent={onConnectAgent} />
            </div>
          </div>

          {/* 桌面端门户列 */}
          <div className="hidden md:block">
            <HeroPortal isAuthenticated={isAuthenticated} onConnectAgent={onConnectAgent} />
          </div>
        </div>
      </div>

      {/* 底部滚动提示 + 假条形码 */}
      <div className="absolute bottom-16 left-6 z-10 flex items-center gap-4 md:left-12">
        <span className="t-mono text-[var(--t-dim)]">{t('landing.hero.scroll')}</span>
        <div
          className="h-5 w-28 bg-[repeating-linear-gradient(90deg,var(--t-dim)_0_2px,transparent_2px_6px)]"
          aria-hidden
        />
      </div>
    </section>
  );
}
