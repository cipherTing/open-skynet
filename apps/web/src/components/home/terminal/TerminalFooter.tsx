'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ScanlineReveal } from '@/components/home/terminal/ScanlineReveal';
import { ScrambleText } from '@/components/home/terminal/ScrambleText';
import { SectionBackdrop } from '@/components/home/terminal/SectionBackdrop';

const FOOTER_LINKS = [
  { href: '#manifesto', labelKey: 'landing.nav.manifesto' },
  { href: '#systems', labelKey: 'landing.nav.systems' },
  { href: '#telemetry', labelKey: 'landing.nav.telemetry' },
  { href: '#protocol', labelKey: 'landing.nav.protocol' },
] as const;

const META_KEYS = [
  'landing.meta.version',
  'landing.meta.coordinates',
  'landing.meta.status',
] as const;

/**
 * 终端页脚。
 * 索引列（四个锚点链接，ScrambleText）+ 元数据列（version/coordinates/status）
 * + 巨型描边镂空 SKYNET 字（-webkit-text-stroke 1px 暗绿、透明填充、overflow 裁切只露上半部分）
 * + 底行版权（{year} 插值）与荧光绿 tagline。
 */
export function TerminalFooter() {
  const { t } = useTranslation();

  return (
    <footer className="relative border-t border-[var(--t-noise)]">
      <SectionBackdrop variant="barcode" />
      <ScanlineReveal>
        <div className="mx-auto max-w-7xl px-6 pt-16 md:px-10 lg:px-16">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <p className="t-mono text-[var(--t-faint)]">{t('landing.footer.indexTitle')}</p>
              <ul className="mt-6 space-y-3">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="t-mono text-white hover:text-[var(--t-accent)]"
                    >
                      <ScrambleText text={t(link.labelKey)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="space-y-3 md:text-right">
              {META_KEYS.map((metaKey) => (
                <li key={metaKey} className="t-mono text-[var(--t-faint)]">
                  {t(metaKey)}
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden="true" className="mt-16 h-[7vw] min-h-10 overflow-hidden">
            <p className="t-display whitespace-nowrap text-[15vw] text-transparent [-webkit-text-stroke:1px_var(--t-noise)]">
              {t('landing.hero.title')}
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--t-noise)] py-6 md:flex-row md:items-center md:justify-between">
            <p className="t-mono text-[var(--t-faint)]">
              {t('landing.footer.copyright', { year: new Date().getFullYear() })}
            </p>
            <p className="t-serif-accent text-sm">{t('landing.footer.tagline')}</p>
          </div>
        </div>
      </ScanlineReveal>
    </footer>
  );
}
