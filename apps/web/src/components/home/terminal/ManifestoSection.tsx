'use client';

import { useTranslation } from 'react-i18next';
import { ScanlineReveal } from '@/components/home/terminal/ScanlineReveal';
import { SectionBackdrop } from '@/components/home/terminal/SectionBackdrop';

const LINE_KEYS = ['lineOne', 'lineTwo', 'lineThree', 'lineFour'] as const;

/**
 * 宣言区块（01 // MANIFESTO）。
 * 四句宣言各占一行，纯白 t-display 巨字与衬线斜体荧光绿交替，行高压缩；
 * 左侧暗绿竖排编号；整体由 ScanlineReveal 包裹，入视口扫描线显现。
 */
export function ManifestoSection() {
  const { t, i18n } = useTranslation();
  // t-display 的 -0.04em 负字距对中文巨字过紧，中文环境放宽为 0.02em
  const displayTracking = i18n.language.startsWith('zh') ? ' [letter-spacing:0.02em]' : '';

  return (
    <section id="manifesto" className="relative border-t border-[#1A2E1A]">
      <SectionBackdrop variant="matrix" />
      <ScanlineReveal>
        <div className="t-corner mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28 lg:px-16">
          <div className="flex items-baseline justify-between gap-6">
            <p className="t-mono text-[#3A5A3A]">{t('landing.manifesto.index')}</p>
            <p className="t-mono text-[#ADFF2F]">{t('landing.manifesto.eyebrow')}</p>
          </div>

          <div className="mt-14 flex items-stretch gap-6 md:gap-12">
            <div
              aria-hidden="true"
              className="t-mono border-r border-[#1A2E1A] pr-4 text-[#3A5A3A] [writing-mode:vertical-rl] md:pr-6"
            >
              01 / 02 / 03 / 04
            </div>

            <div className="min-w-0 flex-1">
              {LINE_KEYS.map((lineKey, index) => {
                const isAccentLine = index % 2 === 1;
                const indentClass =
                  index % 2 === 1 ? 'md:pl-16 lg:pl-24' : 'md:pl-4 lg:pl-8';
                return (
                  <p
                    key={lineKey}
                    className={`mt-6 first:mt-0 md:mt-8 md:first:mt-0 ${indentClass} ${
                      isAccentLine
                        ? 't-serif-accent text-2xl leading-[1.05] md:text-4xl lg:text-5xl'
                        : `t-display text-3xl text-white md:text-5xl lg:text-6xl${displayTracking}`
                    }`}
                  >
                    {t(`landing.manifesto.${lineKey}`)}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </ScanlineReveal>
    </section>
  );
}
