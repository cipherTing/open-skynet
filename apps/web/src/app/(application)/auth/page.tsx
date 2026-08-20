'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TTabContent, TTabs } from '@/components/ui/terminal';
import LatticeWebCanvas from '@/components/home/terminal/LatticeWebCanvas';
import { useClockNow } from '@/components/home/terminal/terminal-hooks';
import { ForgotPasswordForm, LoginForm, RegisterForm } from '@/app/auth/_components/AuthModeForms';
import { formatLocalClockTime } from '@/lib/date-time';

type AuthMode = 'login' | 'register' | 'forgot';

const MODE_META: Record<AuthMode, { codeKey: string; kickerKey: string }> = {
  login: { codeKey: 'auth.modeCodeLogin', kickerKey: 'auth.modeKickerLogin' },
  register: { codeKey: 'auth.modeCodeRegister', kickerKey: 'auth.modeKickerRegister' },
  forgot: { codeKey: 'auth.modeCodeForgot', kickerKey: 'auth.modeKickerForgot' },
};

function isAuthMode(value: string): value is AuthMode {
  return value === 'login' || value === 'register' || value === 'forgot';
}

export default function AuthPage() {
  return (
    <Suspense fallback={<GateBoot />}>
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login, register, isAuthenticated, isLoading, isUnavailable, retrySession } = useAuth();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(() => {
    const requestedMode = searchParams.get('mode');
    return requestedMode && isAuthMode(requestedMode) ? requestedMode : 'login';
  });
  const [agreementOpen, setAgreementOpen] = useState(false);
  const configQuery = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: authApi.config,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/workspace');
  }, [isAuthenticated, isLoading, router]);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set('mode', nextMode);
    router.replace(`/auth?${nextSearchParams.toString()}`, { scroll: false });
  };

  const returnToPreviousPage = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.replace('/workspace');
  };

  if (isLoading || configQuery.isPending) return <GateBoot />;
  if (isUnavailable || configQuery.isError) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-black px-4 text-white">
        <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
        <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
        <ViewportCorners />
        <div className="t-corner t-hairline relative w-full max-w-md bg-[var(--t-panel)] p-6 text-center sm:p-8">
          <p className="font-sans text-[12px] font-semibold tracking-normal text-[var(--t-hazard)]">
            {t('auth.errorPrefix')}
            {' // '}
            {t('auth.serviceUnavailableTitle')}
          </p>
          <p className="mt-3 text-sm leading-6 text-white/70">
            {t('auth.serviceUnavailableMessage')}
          </p>
          <TButton
            variant="secondary"
            className="mt-6"
            onClick={() => {
              void retrySession();
              void configQuery.refetch();
            }}
          >
            {t('app.retry')}
          </TButton>
        </div>
      </main>
    );
  }

  const header =
    mode === 'login'
      ? {
          title: t('auth.loginTitle'),
          accent: t('auth.gateAccentLogin'),
          subtitle: t('auth.loginSubtitle'),
        }
      : mode === 'register'
        ? {
            title: t('auth.registerTitle'),
            accent: t('auth.gateAccentRegister'),
            subtitle: t('auth.registerSubtitle'),
          }
        : {
            title: t('auth.forgotTitle'),
            accent: t('auth.gateAccentForgot'),
            subtitle: t('auth.forgotSubtitle'),
          };
  const modeMeta = MODE_META[mode];
  const config = configQuery.data;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-black text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <LatticeWebCanvas className="opacity-25" />
      </div>
      <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
      <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
      <div aria-hidden className="t-vignette pointer-events-none absolute inset-0" />
      <ViewportCorners />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={returnToPreviousPage}
            className="pointer-events-auto inline-flex h-8 items-center gap-1.5 border border-[var(--t-noise)] px-2 font-sans text-[12px] font-medium tracking-normal text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 stroke-[1.5]" />
            {t('auth.backHome')}
          </button>
          <span className="t-mono text-[var(--t-faint)]">{t('auth.gateSystemLabel')}</span>
        </div>
        <GateClock />
      </header>
      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 bg-black/80 px-4 py-3 backdrop-blur-sm sm:px-8">
        <span className="t-mono text-[var(--t-faint)]">{t('auth.gateVersionLabel')}</span>
        <span className="t-mono hidden text-[var(--t-faint)] sm:inline">{t('auth.footer')}</span>
      </footer>
      <span
        aria-hidden
        className="pointer-events-none absolute left-7 top-1/2 z-10 hidden -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--t-faint)] [writing-mode:vertical-rl] xl:block"
      >
        {t('auth.gateLeftRail')}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute right-7 top-1/2 z-10 hidden -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--t-faint)] [writing-mode:vertical-rl] xl:block"
      >
        {t('auth.gateRightRail')}
      </span>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-16 sm:py-20">
        <section className="t-corner t-corner--accent t-hairline w-full bg-[var(--t-panel)]">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--t-noise)] px-5 py-2.5 sm:px-7">
            <span className="t-mono text-white">{t('auth.gatePanelTitle')}</span>
            <span className="t-mono text-[var(--t-accent)]">{t(modeMeta.codeKey)}</span>
          </header>

          <div className="p-5 sm:p-7">
            <p className="t-mono text-[var(--t-faint)]">{t(modeMeta.kickerKey)}</p>
            <h1 className="t-display mt-3 text-[2.5rem] text-[var(--t-ink)] sm:text-5xl">
              {header.title}
            </h1>
            <p className="t-serif-accent mt-3 text-base sm:text-lg">{header.accent}</p>
            <p className="mt-3 text-xs leading-5 text-white/60">{header.subtitle}</p>

            <TTabs
              className="mt-6"
              items={[
                { id: 'login', label: t('auth.tabLogin') },
                { id: 'register', label: t('auth.tabRegister') },
                { id: 'forgot', label: t('auth.forgotPassword') },
              ]}
              active={mode}
              onChange={(value) => {
                if (isAuthMode(value)) changeMode(value);
              }}
            >
              <TTabContent value="login" className="focus-visible:outline-none">
                <LoginForm
                  config={config}
                  login={login}
                  onOpenAgreement={() => setAgreementOpen(true)}
                />
              </TTabContent>
              <TTabContent value="register" className="focus-visible:outline-none">
                <RegisterForm
                  config={config}
                  register={register}
                  onOpenAgreement={() => setAgreementOpen(true)}
                />
              </TTabContent>
              <TTabContent value="forgot" className="focus-visible:outline-none">
                <ForgotPasswordForm config={config} onComplete={() => changeMode('login')} />
              </TTabContent>
            </TTabs>
          </div>
        </section>
      </div>
      <AgreementDialog open={agreementOpen} onOpenChange={setAgreementOpen} />
    </main>
  );
}

function ViewportCorners() {
  const base = 'pointer-events-none absolute h-3 w-3 border-[var(--t-faint)]';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-3 z-10 sm:inset-4">
      <span className={`${base} left-0 top-0 border-l border-t`} />
      <span className={`${base} right-0 top-0 border-r border-t`} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} />
      <span className={`${base} bottom-0 right-0 border-b border-r`} />
    </div>
  );
}

function GateBoot() {
  const { t } = useTranslation();
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-9 w-9">
          <div className="absolute inset-0 border border-[var(--t-noise)]" />
          <div className="absolute inset-0 animate-[t-spin-step_1s_steps(8)_infinite] border-t border-[var(--t-accent)] motion-reduce:animate-none" />
          <div className="absolute inset-[7px] animate-[t-blink_1.6s_steps(1)_infinite] bg-[var(--t-accent)]/20 motion-reduce:animate-none" />
        </div>
        <span className="t-mono text-[var(--t-faint)]">{t('app.loading')}</span>
        <span className="t-mono text-[var(--t-faint)]">{t('auth.gateBootLabel')}</span>
      </div>
    </main>
  );
}

function GateClock() {
  const now = useClockNow(1000);
  const text = now ? formatLocalClockTime(now) : '--:--:--';
  return <span className="t-mono text-[var(--t-faint)]">{text}</span>;
}

function AgreementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <TerminalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('auth.agreementTitle')}
      description={t('auth.agreementBody')}
      code={t('auth.agreementCode')}
      size="md"
    >
      <p className="whitespace-pre-line text-sm leading-7 text-text-secondary">
        {t('auth.agreementBody')}
      </p>
    </TerminalDialog>
  );
}
