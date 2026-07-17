'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanlineReveal } from '@/components/home/terminal/ScanlineReveal';
import { ScrambleText } from '@/components/home/terminal/ScrambleText';
import { SectionBackdrop } from '@/components/home/terminal/SectionBackdrop';

const ENTRY_KEYS = ['tribunal', 'commons', 'signals', 'ascent'] as const;

type EntryKey = (typeof ENTRY_KEYS)[number];

/** i18n returnObjects 边界收窄：只接受纯字符串数组，其余一律视为空。 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/* ------------------------------------------------------------------ */
/* 右侧微型装饰视觉：纯 SVG，暗绿为主、荧光绿点睛，与条目一一对应         */
/* ------------------------------------------------------------------ */

const INK_DIM = '#3A5A3A';
const INK_DARK = '#1A2E1A';
const INK_DEEP = '#122012';
const ACCENT = '#ADFF2F';

/** 社区共治：上方天平刻度 + 投票进度条，荧光绿段为已计票比例。 */
function TribunalGlyph() {
  const ticks = Array.from({ length: 11 }, (_, index) => index * 7.2);
  return (
    <svg viewBox="0 0 72 28" className="h-7 w-[72px]" aria-hidden="true">
      {ticks.map((x, index) => (
        <line
          key={index}
          x1={x}
          y1={2}
          x2={x}
          y2={index === 5 ? 9 : 6}
          stroke={INK_DIM}
          strokeWidth={1}
        />
      ))}
      <rect x={0} y={16} width={72} height={5} fill={INK_DEEP} />
      <rect x={0} y={16} width={46} height={5} fill={ACCENT} opacity={0.9} />
      <line x1={46} y1={13} x2={46} y2={24} stroke={ACCENT} strokeWidth={1} />
    </svg>
  );
}

/** 圈子共建：根节点向成员分叉的小型拓扑，共识逐层向外改写。 */
function CommonsGlyph() {
  return (
    <svg viewBox="0 0 72 28" className="h-7 w-[72px]" aria-hidden="true">
      <path
        d="M7 14 H18 M18 14 V4 H30 M18 14 H30 M18 14 V24 H30"
        fill="none"
        stroke={INK_DIM}
        strokeWidth={1}
      />
      <path
        d="M35 14 H44 M44 14 V8 H52 M44 14 V20 H52"
        fill="none"
        stroke={INK_DARK}
        strokeWidth={1}
      />
      <rect x={2} y={11.5} width={5} height={5} fill={ACCENT} />
      <rect x={30} y={1.5} width={5} height={5} fill={INK_DARK} />
      <rect x={30} y={11.5} width={5} height={5} fill={INK_DARK} />
      <rect x={30} y={21.5} width={5} height={5} fill={INK_DARK} />
      <rect x={52} y={5.5} width={4} height={4} fill="none" stroke={INK_DIM} strokeWidth={1} />
      <rect x={52} y={17.5} width={4} height={4} fill="none" stroke={INK_DIM} strokeWidth={1} />
    </svg>
  );
}

/** 反馈信号：七根高低不一的信号柱对应七种信号，荧光绿为其中两档。 */
const SIGNAL_BARS: ReadonlyArray<{ height: number; hot: boolean }> = [
  { height: 8, hot: false },
  { height: 19, hot: true },
  { height: 12, hot: false },
  { height: 24, hot: true },
  { height: 6, hot: false },
  { height: 15, hot: false },
  { height: 10, hot: false },
];

function SignalsGlyph() {
  return (
    <svg viewBox="0 0 72 28" className="h-7 w-[72px]" aria-hidden="true">
      {SIGNAL_BARS.map((bar, index) => (
        <rect
          key={index}
          x={index * 10}
          y={26 - bar.height}
          width={6}
          height={bar.height}
          fill={bar.hot ? ACCENT : INK_DARK}
        />
      ))}
      <line x1={0} y1={26.5} x2={70} y2={26.5} stroke={INK_DIM} strokeWidth={1} />
    </svg>
  );
}

/** 成长体系：九格阶位拾级而上，荧光绿为当前所处阶位。 */
const ASCENT_CELLS = [
  'done',
  'done',
  'done',
  'done',
  'current',
  'todo',
  'todo',
  'todo',
  'todo',
] as const;

function AscentGlyph() {
  return (
    <svg viewBox="0 0 72 28" className="h-7 w-[72px]" aria-hidden="true">
      {ASCENT_CELLS.map((cell, index) => (
        <rect
          key={index}
          x={index * 7.5}
          y={23 - index * 2.5}
          width={5}
          height={5}
          fill={cell === 'done' ? INK_DARK : cell === 'current' ? ACCENT : 'none'}
          stroke={cell === 'current' ? ACCENT : INK_DIM}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

const ENTRY_DECOR: Record<EntryKey, ReactNode> = {
  tribunal: <TribunalGlyph />,
  commons: <CommonsGlyph />,
  signals: <SignalsGlyph />,
  ascent: <AscentGlyph />,
};

/**
 * 系统区块（02 // SYSTEMS）·「社区档案索引」纵向 ledger。
 * 四条全宽档案行，行与行之间 1px 暗绿 hairline；每行非对称三段：
 * 巨型幽灵编号 + 英文代号（左）/ 中文名 + 描述（中）/ 伪规格 + 微型装饰（右）。
 * hover：点阵背景切入、左侧 2px 荧光绿边条亮起、code 由暗绿转荧光绿，全部 steps 过渡。
 */
export function SystemsSection() {
  const { t } = useTranslation();

  return (
    <section id="systems" className="relative border-t border-[#1A2E1A]">
      <SectionBackdrop variant="field" />
      <ScanlineReveal>
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28 lg:px-16">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="t-mono text-[#3A5A3A]">{t('landing.systems.index')}</p>
              <p className="t-mono mt-2 text-[#ADFF2F]">{t('landing.systems.eyebrow')}</p>
              <h2 className="t-display mt-4 max-w-xl text-4xl text-white md:text-6xl">
                {t('landing.systems.title')}
              </h2>
            </div>
            <p className="t-mono max-w-xs text-[#3A5A3A] md:text-right">
              {t('landing.systems.description')}
            </p>
          </div>

          <div className="mt-14 border-y border-[#1A2E1A]">
            {ENTRY_KEYS.map((entryKey, index) => {
              const code = t(`landing.systems.entries.${entryKey}.code`);
              const name = t(`landing.systems.entries.${entryKey}.name`);
              const description = t(`landing.systems.entries.${entryKey}.description`);
              const specs = toStringArray(
                t(`landing.systems.entries.${entryKey}.specs`, { returnObjects: true }),
              );
              return (
                <article
                  key={entryKey}
                  className="group relative border-b border-[#1A2E1A] last:border-b-0"
                >
                  <div
                    aria-hidden="true"
                    className="t-dotgrid pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 [transition-timing-function:steps(3,end)] group-hover:opacity-100"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-[#ADFF2F] opacity-0 transition-opacity duration-150 [transition-timing-function:steps(2,end)] group-hover:opacity-100"
                  />
                  <div className="relative grid grid-cols-1 gap-6 px-2 py-10 md:grid-cols-12 md:gap-8 md:px-6 md:py-14">
                    <div className="flex items-baseline gap-4 md:col-span-3 md:flex-col md:items-start md:gap-2">
                      <span
                        aria-hidden="true"
                        className="t-display text-6xl text-transparent [-webkit-text-stroke:1px_#3A5A3A] md:text-8xl lg:text-9xl"
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <ScrambleText
                        text={code}
                        className="t-mono text-[#3A5A3A] transition-colors duration-150 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]"
                      />
                    </div>

                    <div className="md:col-span-5">
                      <h3 className="t-display text-3xl text-white md:text-4xl">{name}</h3>
                      <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
                        {description}
                      </p>
                    </div>

                    <div className="flex flex-col gap-6 md:col-span-4 md:items-end">
                      {ENTRY_DECOR[entryKey]}
                      <ul className="space-y-2 md:text-right">
                        {specs.map((spec) => {
                          const [label = '', value = ''] = spec
                            .split('//')
                            .map((part) => part.trim());
                          return (
                            <li key={spec} className="t-mono">
                              <span className="text-[#3A5A3A]">{label}</span>
                              {value ? (
                                <span className="text-[#ADFF2F]">{` // ${value}`}</span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </ScanlineReveal>
    </section>
  );
}
