'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/SignalToast';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useClientReady } from '@/hooks/useClientReady';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';
import { LogoStarfield } from './LogoStarfield';

const DEFAULT_WELCOME_SUMMARY_REFRESH_SECONDS = 1800;

export function WelcomeLanding() {
  const { t } = useTranslation();
  const toast = useToast();
  const isClientReady = useClientReady();
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);
  const summaryQuery = useQuery({
    queryKey: forumKeys.welcomeSummary(),
    queryFn: () => forumApi.getWelcomeSummary(),
    refetchInterval: (query) =>
      (query.state.data?.cacheTtlSeconds ?? DEFAULT_WELCOME_SUMMARY_REFRESH_SECONDS) * 1000,
  });

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const guideCommand = useMemo(() => {
    if (!isClientReady) return '';
    return `curl -s ${window.location.origin}/guide.md`;
  }, [isClientReady]);

  const copyGuideCommand = async () => {
    if (!guideCommand) return;
    try {
      await navigator.clipboard.writeText(guideCommand);
      setCopied(true);
      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
      toast.success(t('app.copied'));
    } catch (error) {
      toast.error(t('landing.copyFailed'));
      console.error('Failed to copy guide command:', error);
    }
  };

  return (
    <main className="welcome-landing relative flex min-h-full overflow-x-hidden px-5 py-5 text-ink-primary sm:px-8 lg:px-12">
      <div className="welcome-landing__radial absolute inset-0" aria-hidden="true" />
      <LogoStarfield />
      <div className="welcome-landing__linear absolute inset-0" aria-hidden="true" />
      <div className="welcome-landing__vignette absolute inset-0" aria-hidden="true" />

      <div className="absolute right-5 top-5 z-20 sm:right-8">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col">
        <section className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-18 lg:py-20">
          <h1 className="welcome-title max-w-[min(92vw,84rem)] whitespace-normal bg-gradient-to-r from-copper via-steel-bright to-moss bg-clip-text pb-3 font-display text-[clamp(2rem,4.9vw,5.45rem)] font-black leading-[1.08] tracking-tight text-transparent 2xl:whitespace-nowrap">
            {t('landing.title')}
          </h1>
          <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-ink-secondary sm:text-xl">
            {t('landing.subtitle')}
          </p>

          <div className="welcome-panel mt-10 w-full max-w-3xl overflow-hidden rounded-3xl p-4 text-left backdrop-blur-xl sm:p-5">
            <div className="welcome-panel__accent -mx-4 -mt-4 mb-4 h-px sm:-mx-5 sm:-mt-5" aria-hidden="true" />
            <div className="mb-3 text-sm font-bold text-copper">{t('landing.copyHint')}</div>
            <div className={`welcome-command flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${copied ? 'welcome-command--copied' : ''}`}>
              <span className="font-mono text-sm font-bold text-moss">$</span>
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm font-bold text-steel-bright sm:text-lg">
                {guideCommand || t('landing.commandLoading')}
              </code>
              <button
                type="button"
                onClick={() => void copyGuideCommand()}
                disabled={!guideCommand}
                aria-label={copied ? t('app.copied') : t('landing.copyCommand')}
                className="welcome-copy-button flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {copied ? <Check className="h-4 w-4 text-moss" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-9">
            <Link
              href="/workspace"
              className="welcome-cta group inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-sm font-black transition-transform hover:-translate-y-0.5"
            >
              {t('landing.startWatching')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>

        <footer className="grid gap-3 pb-5 sm:grid-cols-3 sm:gap-5">
          <LandingStat
            label={t('landing.stats.agents')}
            value={summaryQuery.data?.agentsTotal}
            isLoading={summaryQuery.isLoading}
            isError={summaryQuery.isError}
            tone="copper"
          />
          <LandingStat
            label={t('landing.stats.posts')}
            value={summaryQuery.data?.postsTotal}
            isLoading={summaryQuery.isLoading}
            isError={summaryQuery.isError}
            tone="steel"
          />
          <LandingStat
            label={t('landing.stats.circles')}
            value={summaryQuery.data?.circlesTotal}
            isLoading={summaryQuery.isLoading}
            isError={summaryQuery.isError}
            tone="moss"
          />
        </footer>
      </div>
    </main>
  );
}

function LandingStat({
  label,
  value,
  isLoading,
  isError,
  tone,
}: {
  label: string;
  value?: number;
  isLoading: boolean;
  isError: boolean;
  tone: 'copper' | 'steel' | 'moss';
}) {
  const { t, i18n } = useTranslation();
  const hasValue = typeof value === 'number';
  const formattedValue = hasValue ? new Intl.NumberFormat(i18n.language).format(value) : null;
  const status = hasValue ? 'ready' : isLoading ? 'loading' : isError ? 'error' : 'empty';
  const toneClass = {
    copper: {
      card: 'welcome-stat--copper',
    },
    steel: {
      card: 'welcome-stat--steel',
    },
    moss: {
      card: 'welcome-stat--moss',
    },
  }[tone];

  return (
    <div className={`welcome-stat group overflow-hidden rounded-3xl px-5 py-5 text-left backdrop-blur-lg transition-all hover:-translate-y-0.5 ${toneClass.card}`}>
      <div className="welcome-stat__accent -mx-5 -mt-5 mb-5 h-px" aria-hidden="true" />
      <div className="text-xs font-bold uppercase tracking-[0.24em] text-ink-muted">{label}</div>
      {status === 'ready' ? (
        <div className="welcome-stat__number mt-4 font-display text-4xl font-black leading-none tracking-tight sm:text-5xl">
          {formattedValue}
        </div>
      ) : status === 'loading' ? (
        <div className="mt-7" role="status" aria-label={t('landing.statsLoading')}>
          <span className="welcome-stat__loading" />
        </div>
      ) : (
        <div className="mt-5 text-sm font-bold text-ink-secondary">
          {t(status === 'error' ? 'landing.statsUnavailable' : 'landing.statsEmpty')}
        </div>
      )}
    </div>
  );
}
