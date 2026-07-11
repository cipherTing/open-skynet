'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Search, Radio } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';

export interface TopBarGovernanceControls {
  statusLabel: string;
  progressValue: number;
  isProgressPaused: boolean;
  isRefreshing: boolean;
  refreshDisabled: boolean;
  refreshLabel: string;
  onRefresh: () => void;
}

interface TopBarProps {
  disableScrollFade?: boolean;
  position?: 'sticky' | 'static';
  mode?: 'feed' | 'circles' | 'governance' | 'detail';
  detailTitle?: string;
  detailTitleKey?: string;
  backHref?: string;
  backLabel?: string;
  backLabelKey?: string;
  backSection?: HomeSection;
  preferHistoryBack?: boolean;
  governanceControls?: TopBarGovernanceControls;
}

function useClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-GB', { hour12: false }));
      setDate(now.toLocaleDateString('en-CA'));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return { time, date };
}

export function TopBar({
  disableScrollFade = false,
  position = 'sticky',
  mode = 'feed',
  detailTitle,
  detailTitleKey,
  backHref,
  backLabel,
  backLabelKey,
  backSection,
  preferHistoryBack = false,
  governanceControls,
}: TopBarProps) {
  const { time, date } = useClock();
  const { t } = useTranslation();
  const router = useRouter();
  const setHomeActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const [scrolled, setScrolled] = useState(false);
  const effectiveScrolled = !disableScrollFade && scrolled;
  const isGovernanceMode = mode === 'governance';
  const isFeedMode = mode === 'feed';
  const resolvedBackLabel = backLabel ?? (backLabelKey ? t(backLabelKey) : '');
  const hasBackLink = Boolean(resolvedBackLabel && (backHref || preferHistoryBack));
  const backControlClassName =
    'inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1/45 px-2.5 py-1.5 text-xs font-bold tracking-wide text-ink-secondary transition-all hover:border-border-accent hover:bg-accent-muted hover:text-copper sm:max-w-none';
  const showsCompactSectionLabel = isGovernanceMode || mode === 'detail';
  const sectionLabel = isGovernanceMode
    ? t('governance.plazaTitle')
    : mode === 'circles'
      ? t('circles.plazaTitle')
      : mode === 'detail'
        ? detailTitle ?? (detailTitleKey ? t(detailTitleKey) : t('app.terminal'))
        : t('app.terminal');

  useEffect(() => {
    if (disableScrollFade) {
      return undefined;
    }

    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [disableScrollFade]);

  return (
      <motion.header
      initial={disableScrollFade ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: effectiveScrolled ? 0 : 1, y: effectiveScrolled ? -10 : 0 }}
      transition={{ duration: 0.3 }}
      className={`${position === 'sticky' ? 'sticky top-0' : 'relative flex-none'} z-30 pointer-events-none`}
    >
      <div
        className={
          isGovernanceMode
            ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-6 pb-0 pt-1.5'
            : 'flex items-center justify-between px-6 pb-0 pt-1.5'
        }
      >
        {/* 左: 区域标识 */}
        <div
          className={`flex items-center gap-3 pointer-events-auto ${
            showsCompactSectionLabel ? 'min-w-0' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            {hasBackLink ? (
              preferHistoryBack ? (
                <button
                  type="button"
                  onClick={() => {
                    if (backSection) setHomeActiveSection(backSection);
                    router.back();
                  }}
                  className={backControlClassName}
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[30vw] truncate sm:max-w-none">{resolvedBackLabel}</span>
                </button>
              ) : (
                <Link
                  href={backHref!}
                  onClick={() => {
                    if (backSection) setHomeActiveSection(backSection);
                  }}
                  className={backControlClassName}
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[30vw] truncate sm:max-w-none">{resolvedBackLabel}</span>
                </Link>
              )
            ) : (
              <>
                <Radio className="w-4 h-4 text-copper" />
                <span className="text-copper font-display text-base font-bold tracking-deck-wide">
                  SKYNET
                </span>
              </>
            )}
          </div>
          <div className={`${hasBackLink ? 'hidden sm:block' : 'block'} h-4 w-px bg-border-subtle`} />
          <span
            className={`text-xs text-ink-muted tracking-wider uppercase ${
              showsCompactSectionLabel
                ? hasBackLink
                  ? 'hidden min-w-0 truncate sm:inline sm:max-w-none'
                  : 'min-w-0 max-w-[42vw] truncate sm:max-w-none'
                : 'hidden sm:inline'
            }`}
          >
            {sectionLabel}
          </span>
        </div>

        {/* 中: 评审状态 */}
        <div
          className={`min-w-0 items-center gap-4 pointer-events-auto ${
            isGovernanceMode
              ? 'order-3 flex w-full justify-start sm:order-none sm:w-auto sm:flex-1 sm:justify-center'
              : 'hidden'
          }`}
        >
          {governanceControls ? (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border-subtle bg-surface-1/35 px-2 py-1.5 sm:px-2.5">
              <span className="min-w-0 max-w-[12rem] truncate text-xs text-ink-secondary tracking-wide sm:max-w-48">
                {governanceControls.statusLabel}
              </span>
              <div
                className={`relative h-1 w-14 shrink-0 overflow-hidden rounded-full bg-ink-muted/15 sm:w-20 ${
                  governanceControls.isProgressPaused ? 'opacity-45' : ''
                }`}
                role="progressbar"
                aria-label={governanceControls.statusLabel}
                aria-valuetext={governanceControls.statusLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(governanceControls.progressValue * 100)}
              >
                <motion.span
                  className="absolute inset-0 block origin-left rounded-full bg-ink-muted/55"
                  animate={{ scaleX: governanceControls.progressValue }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                />
              </div>
              <PortalTooltip content={governanceControls.refreshLabel} placement="bottom">
                <button
                  type="button"
                  aria-label={governanceControls.refreshLabel}
                  disabled={governanceControls.refreshDisabled}
                  onClick={governanceControls.onRefresh}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-subtle text-ink-muted transition-all hover:border-border-accent hover:bg-accent-muted hover:text-copper disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${governanceControls.isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </PortalTooltip>
            </div>
          ) : null}
        </div>

        {/* 右: 搜索 + 主题 + 语言 + 时钟 */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* 搜索 */}
          {isFeedMode && (
            <div className="relative group hidden xl:block">
              <Search className="skynet-input-icon absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('app.searchPosts')}
                className="skynet-input w-56 rounded-lg py-2 pl-9 pr-3 font-sans text-sm tracking-wide"
              />
            </div>
          )}

          <ThemeToggle />
          <LanguageToggle />

          <div className="w-px h-4 bg-border-subtle" />

          {/* 时钟 */}
          <div className={`${isGovernanceMode ? 'hidden sm:block' : 'block'} text-right`}>
            <div className="text-moss text-sm font-mono font-bold tracking-wider tabular-nums">
              {time}
            </div>
            <div className="text-xs text-ink-muted font-mono tracking-deck-normal tabular-nums">
              {date}
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
