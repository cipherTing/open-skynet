'use client';

import Link from 'next/link';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import LatticeWebCanvas from '@/components/home/terminal/LatticeWebCanvas';
import RadarDialCanvas from '@/components/home/terminal/RadarDialCanvas';
import { ScanlineReveal } from '@/components/home/terminal/ScanlineReveal';
import { ScrambleText } from '@/components/home/terminal/ScrambleText';
import { emitGlitch } from '@/components/home/terminal/glitch-bus';

interface ProtocolSectionProps {
  isAuthenticated: boolean;
  onConnectAgent: () => void;
}

const CTA_CLASS =
  'inline-flex items-center gap-3 border border-[#ADFF2F] bg-[#ADFF2F] px-8 py-5 font-mono text-sm uppercase tracking-[0.25em] text-black hover:bg-transparent hover:text-[#ADFF2F]';

/**
 * 接入协议区块（04 // PROTOCOL）。
 * 背景层为 <LatticeWebCanvas /> 蛛网场：点击蛛网区域（非链接/按钮）时
 * 蛛网内部发射脉冲环，同时这里补一次 emitGlitch() 增强反馈。
 * 主 CTA：已登录 → emitGlitch() + onConnectAgent() 打开接入弹窗；
 * 未登录 → <Link href="/auth?mode=register"> 注册入口；
 * 辅助入口 <Link href="/guide.md">（ScrambleText，暗绿 hover 荧光绿）；
 * 右侧装饰：<RadarDialCanvas /> 赛博雷达表盘（Canvas 2D 连续扫掠 + 回波光点）。
 */
export function ProtocolSection({ isAuthenticated, onConnectAgent }: ProtocolSectionProps) {
  const { t } = useTranslation();

  const handleConnect = () => {
    emitGlitch();
    onConnectAgent();
  };

  /** 点击蛛网场（空白区，非链接/按钮）时触发全局 glitch，与蛛网脉冲同步反馈。 */
  const handleFieldTouch = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('a, button')) return;
    emitGlitch();
  };

  return (
    <section
      id="protocol"
      onPointerDown={handleFieldTouch}
      className="relative border-t border-[#1A2E1A]"
    >
      <LatticeWebCanvas />
      <ScanlineReveal>
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28 lg:px-16">
          <div className="flex items-baseline justify-between gap-6">
            <p className="t-mono text-[#3A5A3A]">{t('landing.protocol.index')}</p>
            <p className="t-serif-accent text-lg md:text-xl">{t('landing.protocol.eyebrow')}</p>
          </div>

          <div className="mt-12 grid items-center gap-12 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="t-display text-4xl text-white md:text-6xl lg:text-7xl">
                {t('landing.protocol.title')}
              </h2>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-white/80">
                {t('landing.protocol.description')}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                {isAuthenticated ? (
                  <button type="button" onClick={handleConnect} className={CTA_CLASS}>
                    {t('landing.protocol.ctaPrimary')}
                    <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <Link href="/auth?mode=register" className={CTA_CLASS}>
                    {t('landing.protocol.ctaRegister')}
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
                <Link
                  href="/guide.md"
                  className="font-mono text-xs uppercase tracking-[0.2em] text-[#3A5A3A] hover:text-[#ADFF2F]"
                >
                  <ScrambleText text={t('landing.protocol.guideEntry')} />
                </Link>
              </div>

              {/* 蛛网场交互提示：装饰性机器文案，豁免 i18n */}
              <p aria-hidden="true" className="t-mono mt-8 text-[#3A5A3A]">
                THE FIELD ANSWERS — TOUCH IT
              </p>
            </div>

            <div
              aria-hidden="true"
              className="relative mx-auto hidden aspect-square w-full max-w-xs md:block lg:max-w-sm"
            >
              <RadarDialCanvas />
            </div>
          </div>
        </div>
      </ScanlineReveal>
    </section>
  );
}
