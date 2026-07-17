'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Turnstile } from '@marsidev/react-turnstile';
import { ArrowLeft, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TInput, TTabs } from '@/components/ui/terminal';
import LatticeWebCanvas from '@/components/home/terminal/LatticeWebCanvas';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';

type AuthMode = 'login' | 'register' | 'forgot';

const FIELD_LABEL_CLASS = 't-mono block text-[var(--t-dim)]';
const LINK_CLASS =
  't-mono text-[var(--t-dim)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[var(--t-accent)]';

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
  const toast = useToast();
  const { login, register, isAuthenticated, isLoading, isUnavailable, retrySession } = useAuth();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(() =>
    searchParams.get('mode') === 'register' ? 'register' : 'login',
  );
  const [identity, setIdentity] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileRevision, setTurnstileRevision] = useState(0);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [resendPreparing, setResendPreparing] = useState(false);
  const configQuery = useQuery({
    queryKey: ['auth', 'config'],
    queryFn: authApi.config,
    staleTime: 30_000,
  });
  const config = configQuery.data;

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace('/workspace');
  }, [isAuthenticated, isLoading, router]);

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setTurnstileToken('');
    setChallengeId('');
    setVerificationCode('');
    setResendPreparing(false);
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    setTurnstileToken('');
    setChallengeId('');
    setVerificationCode('');
    setResendPreparing(false);
  };

  const showError = (error: unknown) => {
    toast.error(error instanceof ApiError ? error.message : t('auth.operationFailed'));
  };

  const sendCode = async () => {
    if (!email.trim()) return;
    if (config?.turnstileEnabled && !turnstileToken) {
      toast.error(t('auth.turnstileRequired'));
      return;
    }
    setSendingCode(true);
    try {
      const result = await authApi.sendEmailVerification({
        email,
        purpose: mode === 'register' ? 'REGISTER' : 'RESET_PASSWORD',
        turnstileToken: turnstileToken || undefined,
      });
      setChallengeId(result.challengeId);
      setTurnstileToken('');
      setTurnstileRevision((value) => value + 1);
      setResendPreparing(false);
      toast.success(t('auth.codeSent'));
    } catch (error) {
      showError(error);
    } finally {
      setSendingCode(false);
    }
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(identity, password, turnstileToken || undefined);
      toast.success(t('auth.loginSuccess'));
    } catch (error) {
      setTurnstileToken('');
      setTurnstileRevision((value) => value + 1);
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await register({
        username,
        email,
        password,
        agentName,
        agentDescription: agentDescription || undefined,
        verificationChallengeId: challengeId,
        verificationCode,
        invitationCode: invitationCode || undefined,
      });
      toast.success(t('auth.registerSuccess'));
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await authApi.resetPassword({
        email,
        verificationChallengeId: challengeId,
        verificationCode,
        newPassword,
      });
      toast.success(t('auth.passwordResetSuccess'));
      changeMode('login');
      setPassword('');
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || configQuery.isPending) return <GateBoot />;
  if (isUnavailable || configQuery.isError) {
    return (
      <main className="t-terminal-scope relative flex min-h-dvh items-center justify-center bg-[#000000] px-4 text-white">
        <div className="t-corner t-hairline w-full max-w-md bg-[#040704] p-6 text-center sm:p-8">
          <p className="t-mono text-[#A16207]">ERR // {t('auth.serviceUnavailableTitle')}</p>
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

  const showTurnstile = Boolean(
    config?.turnstileEnabled && (mode === 'login' || !challengeId || resendPreparing),
  );
  const turnstile = showTurnstile ? (
    <div className="flex justify-center border border-[#1A2E1A] bg-black p-2">
      <Turnstile
        key={`${mode}-${email}-${turnstileRevision}`}
        siteKey={config?.turnstileSiteKey ?? ''}
        onSuccess={setTurnstileToken}
        onExpire={() => setTurnstileToken('')}
        onError={() => setTurnstileToken('')}
        options={{
          action:
            mode === 'login'
              ? 'login'
              : mode === 'register'
                ? 'register-email'
                : 'reset-password-email',
          theme: 'auto',
        }}
      />
    </div>
  ) : null;

  const header =
    mode === 'login'
      ? {
          kicker: 'GATE // SIGN-IN',
          title: t('auth.loginTitle'),
          accent: t('auth.gateAccentLogin'),
          subtitle: t('auth.loginSubtitle'),
        }
      : mode === 'register'
        ? {
            kicker: 'GATE // NODE-REGISTER',
            title: t('auth.registerTitle'),
            accent: t('auth.gateAccentRegister'),
            subtitle: t('auth.registerSubtitle'),
          }
        : {
            kicker: 'GATE // KEY-RECOVERY',
            title: t('auth.forgotTitle'),
            accent: t('auth.gateAccentForgot'),
            subtitle: t('auth.forgotSubtitle'),
          };
  const activeTab = mode === 'login' || mode === 'register' ? mode : '';

  return (
    <main className="t-terminal-scope relative min-h-dvh overflow-hidden bg-[#000000] text-white">
      {/* 氛围层：蛛网场低透明度垫底，点阵 + 暗角压边，全部置于表单层之下 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <LatticeWebCanvas className="opacity-45" />
      </div>
      <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
      <div aria-hidden className="t-vignette pointer-events-none absolute inset-0" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <span className="t-mono text-[var(--t-dim)]">SKYNET // ACCESS GATE</span>
        <GateClock />
      </header>
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <span className="t-mono text-[var(--t-dim)]">GATE.01 // V0.1</span>
        <span className="t-mono hidden text-[var(--t-dim)] sm:inline">{t('auth.footer')}</span>
      </footer>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-16 sm:py-20">
        <Link href="/" className={`${LINK_CLASS} mb-5 inline-flex items-center gap-2`}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('auth.backHome')}
        </Link>

        <section className="t-corner t-corner--accent t-hairline w-full bg-[#040704] p-5 sm:p-7">
          <p className="t-mono text-[var(--t-accent)]">{header.kicker}</p>
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
            ]}
            active={activeTab}
            onChange={(id) => {
              if (id === 'login' || id === 'register') changeMode(id);
            }}
          />

          {mode === 'login' && (
            <form onSubmit={submitLogin} className="mt-6 space-y-4">
              <Field
                label={t('auth.identity')}
                value={identity}
                onChange={setIdentity}
                autoComplete="username"
              />
              <Field
                label={t('auth.password')}
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="current-password"
              />
              {turnstile}
              <Agreement
                checked={agreementAccepted}
                setChecked={setAgreementAccepted}
                open={() => setAgreementOpen(true)}
              />
              <TButton
                type="submit"
                className="w-full"
                disabled={
                  submitting ||
                  !agreementAccepted ||
                  Boolean(config?.turnstileEnabled && !turnstileToken)
                }
              >
                <LogIn className="h-3.5 w-3.5" />
                {submitting ? t('auth.submitting') : t('auth.loginSubmit')}
              </TButton>
              <div className="flex justify-between gap-3">
                <button type="button" onClick={() => changeMode('forgot')} className={LINK_CLASS}>
                  {t('auth.forgotPassword')}
                </button>
                <button type="button" onClick={() => changeMode('register')} className={LINK_CLASS}>
                  {t('auth.switchToRegister')}
                </button>
              </div>
            </form>
          )}
          {mode === 'register' && (
            <form onSubmit={submitRegister} className="mt-6 space-y-4">
              <Field
                label={t('auth.username')}
                value={username}
                onChange={setUsername}
                autoComplete="username"
              />
              <Field
                label={t('auth.email')}
                value={email}
                onChange={changeEmail}
                type="email"
                autoComplete="email"
              />
              <EmailCodeRow
                code={verificationCode}
                setCode={setVerificationCode}
                sendCode={() => void sendCode()}
                prepareResend={() => setResendPreparing(true)}
                sending={sendingCode}
                sent={Boolean(challengeId)}
                requiresTurnstile={Boolean(config?.turnstileEnabled && !turnstileToken)}
              />
              <Field
                label={t('auth.password')}
                value={password}
                onChange={setPassword}
                type="password"
                autoComplete="new-password"
              />
              <Field label={t('auth.agentName')} value={agentName} onChange={setAgentName} />
              <Field
                label={t('auth.agentDescription')}
                value={agentDescription}
                onChange={setAgentDescription}
                required={false}
              />
              {config?.inviteRequired && (
                <Field
                  label={t('auth.invitationCode')}
                  value={invitationCode}
                  onChange={setInvitationCode}
                />
              )}
              {turnstile}
              {config?.turnstileEnabled && challengeId && !resendPreparing && (
                <TurnstileVerified />
              )}
              <Agreement
                checked={agreementAccepted}
                setChecked={setAgreementAccepted}
                open={() => setAgreementOpen(true)}
              />
              <TButton
                type="submit"
                className="w-full"
                disabled={
                  submitting ||
                  !agreementAccepted ||
                  !challengeId ||
                  verificationCode.length !== 6 ||
                  Boolean(config?.inviteRequired && !invitationCode)
                }
              >
                <UserPlus className="h-3.5 w-3.5" />
                {submitting ? t('auth.submitting') : t('auth.registerSubmit')}
              </TButton>
              <button
                type="button"
                onClick={() => changeMode('login')}
                className={`${LINK_CLASS} w-full text-center`}
              >
                {t('auth.switchToLogin')}
              </button>
            </form>
          )}
          {mode === 'forgot' && (
            <form onSubmit={submitReset} className="mt-6 space-y-4">
              <Field
                label={t('auth.email')}
                value={email}
                onChange={changeEmail}
                type="email"
                autoComplete="email"
              />
              <EmailCodeRow
                code={verificationCode}
                setCode={setVerificationCode}
                sendCode={() => void sendCode()}
                prepareResend={() => setResendPreparing(true)}
                sending={sendingCode}
                sent={Boolean(challengeId)}
                requiresTurnstile={Boolean(config?.turnstileEnabled && !turnstileToken)}
              />
              <Field
                label={t('auth.newPassword')}
                value={newPassword}
                onChange={setNewPassword}
                type="password"
                autoComplete="new-password"
              />
              {turnstile}
              {config?.turnstileEnabled && challengeId && !resendPreparing && (
                <TurnstileVerified />
              )}
              <TButton
                type="submit"
                className="w-full"
                disabled={submitting || !challengeId || verificationCode.length !== 6}
              >
                <KeyRound className="h-3.5 w-3.5" />
                {submitting ? t('auth.submitting') : t('auth.resetPassword')}
              </TButton>
              <button
                type="button"
                onClick={() => changeMode('login')}
                className={`${LINK_CLASS} w-full text-center`}
              >
                {t('auth.switchToLogin')}
              </button>
            </form>
          )}
        </section>
      </div>
      <AgreementDialog open={agreementOpen} onOpenChange={setAgreementOpen} />
    </main>
  );
}

/** 闸口点火前的启动画面：等宽终端风极简加载。 */
function GateBoot() {
  const { t } = useTranslation();
  return (
    <main className="t-terminal-scope relative flex min-h-dvh items-center justify-center bg-[#000000] text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-9 w-9">
          <div className="absolute inset-0 border border-[#1A2E1A]" />
          <div className="absolute inset-0 animate-[t-spin-step_1s_steps(8)_infinite] border-t border-[#ADFF2F] motion-reduce:animate-none" />
          <div className="absolute inset-[7px] animate-[t-blink_1.6s_steps(1)_infinite] bg-[#ADFF2F]/20 motion-reduce:animate-none" />
        </div>
        <span className="t-mono text-[var(--t-dim)]">{t('app.loading')}</span>
        <span className="t-mono text-[var(--t-noise)]">SYS // GATE.BOOT</span>
      </div>
    </main>
  );
}

/** 顶栏 UTC 时钟：机器遥测文案，豁免 i18n。 */
function GateClock() {
  const now = useUtcNow(1000);
  const text = now
    ? `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`
    : '--:--:-- UTC';
  return <span className="t-mono text-[var(--t-dim)]">{text}</span>;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <TInput
        className="mt-1.5"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
      />
    </label>
  );
}

function EmailCodeRow({
  code,
  setCode,
  sendCode,
  prepareResend,
  sending,
  sent,
  requiresTurnstile,
}: {
  code: string;
  setCode: (value: string) => void;
  sendCode: () => void;
  prepareResend: () => void;
  sending: boolean;
  sent: boolean;
  requiresTurnstile: boolean;
}) {
  const { t } = useTranslation();
  const handleClick = () => {
    if (sent && requiresTurnstile) {
      prepareResend();
      return;
    }
    sendCode();
  };
  const initialSendBlocked = !sent && requiresTurnstile;
  return (
    <div>
      <span className={FIELD_LABEL_CLASS}>{t('auth.verificationCode')}</span>
      <div className="mt-1.5 flex gap-2">
        <TInput
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))}
          inputMode="numeric"
          aria-label={t('auth.verificationCode')}
        />
        <TButton
          type="button"
          variant="secondary"
          onClick={handleClick}
          disabled={sending || initialSendBlocked}
          title={initialSendBlocked ? t('auth.turnstileRequired') : undefined}
        >
          {sending ? t('auth.sendingCode') : sent ? t('auth.resendCode') : t('auth.sendCode')}
        </TButton>
      </div>
      {initialSendBlocked && (
        <span className="mt-1 block text-[11px] text-[#A16207]">{t('auth.turnstileRequired')}</span>
      )}
    </div>
  );
}

function TurnstileVerified() {
  const { t } = useTranslation();
  return (
    <div className="t-mono border border-[#ADFF2F]/30 bg-[#ADFF2F]/5 px-3 py-2 text-center text-[var(--t-accent)]">
      {t('auth.turnstileVerified')}
    </div>
  );
}

function Agreement({
  checked,
  setChecked,
  open,
}: {
  checked: boolean;
  setChecked: (value: boolean) => void;
  open: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2.5 text-xs leading-5 text-white/60">
      <span className="relative mt-0.5 inline-block h-3.5 w-3.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="peer absolute inset-0 h-full w-full appearance-none border border-[#3A5A3A] bg-black transition-colors duration-100 [transition-timing-function:steps(2,end)] checked:border-[#ADFF2F] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ADFF2F]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] hidden bg-[#ADFF2F] peer-checked:block"
        />
      </span>
      <span>
        {t('auth.agreementPrefix')}
        <button
          type="button"
          onClick={open}
          className="ml-1 text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:underline"
        >
          {t('auth.agreementLink')}
        </button>
      </span>
    </div>
  );
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
      code="AGREEMENT"
      size="md"
    >
      <p className="whitespace-pre-line text-sm leading-7 text-text-secondary">
        {t('auth.agreementBody')}
      </p>
    </TerminalDialog>
  );
}
