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

const FIELD_LABEL_CLASS = 't-mono text-[var(--t-faint)]';

/** 各模式的闸口机读代号：机器文案，豁免 i18n。 */
const MODE_META: Record<AuthMode, { code: string; kicker: string }> = {
  login: { code: 'SIGN-IN', kicker: 'GATE // SIGN-IN' },
  register: { code: 'NODE-REGISTER', kicker: 'GATE // NODE-REGISTER' },
  forgot: { code: 'KEY-RECOVERY', kicker: 'GATE // KEY-RECOVERY' },
};

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
  const [errorMessage, setErrorMessage] = useState('');
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
    setErrorMessage('');
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    setTurnstileToken('');
    setChallengeId('');
    setVerificationCode('');
    setResendPreparing(false);
  };

  /** 错误一律走面板内等宽红色行，不走 toast。 */
  const showError = (error: unknown) => {
    setErrorMessage(error instanceof ApiError ? error.message : t('auth.operationFailed'));
  };

  const sendCode = async () => {
    if (!email.trim()) return;
    if (config?.turnstileEnabled && !turnstileToken) {
      setErrorMessage(t('auth.turnstileRequired'));
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
      setErrorMessage('');
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
    setErrorMessage('');
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
    setErrorMessage('');
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
    setErrorMessage('');
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
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#000000] px-4 text-white">
        <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
        <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
        <ViewportCorners />
        <div className="t-corner t-hairline relative w-full max-w-md bg-[var(--t-panel)] p-6 text-center sm:p-8">
          <p className="font-mono text-[11px] tracking-[0.15em] text-[var(--t-hazard)]">
            ERR // {t('auth.serviceUnavailableTitle')}
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

  const showTurnstile = Boolean(
    config?.turnstileEnabled && (mode === 'login' || !challengeId || resendPreparing),
  );
  const turnstile = showTurnstile ? (
    <div className="flex justify-center border border-[var(--t-noise)] bg-black p-2">
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

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#000000] text-white">
      {/* 氛围层：蛛网场压暗垫底（≤25%），叠静态扫描线 + 点阵 + 暗角，全部置于表单层之下 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <LatticeWebCanvas className="opacity-25" />
      </div>
      <div aria-hidden className="t-ambient-scan pointer-events-none absolute inset-0" />
      <div aria-hidden className="t-dotgrid pointer-events-none absolute inset-0 opacity-30" />
      <div aria-hidden className="t-vignette pointer-events-none absolute inset-0" />
      <ViewportCorners />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="pointer-events-auto inline-flex h-8 items-center gap-1.5 border border-[var(--t-noise)] px-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 stroke-[1.5]" />
            {t('auth.backHome')}
          </Link>
          <span className="t-mono text-[var(--t-faint)]">SKYNET // ACCESS GATE</span>
        </div>
        <GateClock />
      </header>
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <span className="t-mono text-[var(--t-faint)]">GATE.01 // V0.1</span>
        <span className="t-mono hidden text-[var(--t-faint)] sm:inline">{t('auth.footer')}</span>
      </footer>
      {/* 左右竖排边缘轨：封闭控制台框架的机器元数据 */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-7 top-1/2 z-10 hidden -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--t-faint)] [writing-mode:vertical-rl] xl:block"
      >
        UPLINK.CH00 // SECURE.LINE
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute right-7 top-1/2 z-10 hidden -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--t-faint)] [writing-mode:vertical-rl] xl:block"
      >
        PROTO.V0.1 // HANDSHAKE
      </span>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-16 sm:py-20">
        <section className="t-corner t-corner--accent t-hairline w-full bg-[var(--t-panel)]">
          {/* 闸口标号条：ACCESS GATE 等宽标号 + 当前模式机读代号 */}
          <header className="flex items-center justify-between gap-3 border-b border-[var(--t-noise)] px-5 py-2.5 sm:px-7">
            <span className="t-mono text-white">ACCESS GATE</span>
            <span className="t-mono text-[var(--t-accent)]">{modeMeta.code}</span>
          </header>

          <div className="p-5 sm:p-7">
            <p className="t-mono text-[var(--t-faint)]">{modeMeta.kicker}</p>
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
              onChange={(id) => {
                if (id === 'login' || id === 'register' || id === 'forgot') changeMode(id);
              }}
            />

            {/* 模式硬切：key 重挂载触发一次 steps 硬闪，模拟信号换台 */}
            <div key={mode} className="animate-[t-blink_0.24s_steps(1)_1] motion-reduce:animate-none">
              {errorMessage ? <ErrorLine message={errorMessage} /> : null}

              {mode === 'login' && (
                <form onSubmit={submitLogin} className="mt-6 space-y-4">
                  <Field
                    label={t('auth.identity')}
                    code="F.01"
                    value={identity}
                    onChange={setIdentity}
                    autoComplete="username"
                  />
                  <Field
                    label={t('auth.password')}
                    code="F.02"
                    value={password}
                    onChange={setPassword}
                    type="password"
                    autoComplete="current-password"
                    placeholder={t('auth.passwordPlaceholder')}
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
                </form>
              )}
              {mode === 'register' && (
                <form onSubmit={submitRegister} className="mt-6 space-y-4">
                  <Field
                    label={t('auth.username')}
                    code="R.01"
                    value={username}
                    onChange={setUsername}
                    autoComplete="username"
                    placeholder={t('auth.usernamePlaceholder')}
                  />
                  <Field
                    label={t('auth.email')}
                    code="R.02"
                    value={email}
                    onChange={changeEmail}
                    type="email"
                    autoComplete="email"
                    placeholder="operator@node.net"
                  />
                  <EmailCodeRow
                    code="R.03"
                    value={verificationCode}
                    setValue={setVerificationCode}
                    sendCode={() => void sendCode()}
                    prepareResend={() => setResendPreparing(true)}
                    sending={sendingCode}
                    sent={Boolean(challengeId)}
                    requiresTurnstile={Boolean(config?.turnstileEnabled && !turnstileToken)}
                  />
                  <Field
                    label={t('auth.password')}
                    code="R.04"
                    value={password}
                    onChange={setPassword}
                    type="password"
                    autoComplete="new-password"
                    placeholder={t('auth.passwordPlaceholder')}
                  />
                  <Field
                    label={t('auth.agentName')}
                    code="R.05"
                    value={agentName}
                    onChange={setAgentName}
                    placeholder={t('auth.agentNamePlaceholder')}
                  />
                  <Field
                    label={t('auth.agentDescription')}
                    code="R.06"
                    value={agentDescription}
                    onChange={setAgentDescription}
                    placeholder={t('auth.agentDescriptionPlaceholder')}
                    required={false}
                  />
                  {config?.inviteRequired && (
                    <Field
                      label={t('auth.invitationCode')}
                      code="R.07"
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
                </form>
              )}
              {mode === 'forgot' && (
                <form onSubmit={submitReset} className="mt-6 space-y-4">
                  <Field
                    label={t('auth.email')}
                    code="K.01"
                    value={email}
                    onChange={changeEmail}
                    type="email"
                    autoComplete="email"
                    placeholder="operator@node.net"
                  />
                  <EmailCodeRow
                    code="K.02"
                    value={verificationCode}
                    setValue={setVerificationCode}
                    sendCode={() => void sendCode()}
                    prepareResend={() => setResendPreparing(true)}
                    sending={sendingCode}
                    sent={Boolean(challengeId)}
                    requiresTurnstile={Boolean(config?.turnstileEnabled && !turnstileToken)}
                  />
                  <Field
                    label={t('auth.newPassword')}
                    code="K.03"
                    value={newPassword}
                    onChange={setNewPassword}
                    type="password"
                    autoComplete="new-password"
                    placeholder={t('auth.passwordPlaceholder')}
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
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
      <AgreementDialog open={agreementOpen} onOpenChange={setAgreementOpen} />
    </main>
  );
}

/** 视口四角 1px L 型角标：封闭控制台框架。 */
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

/** 面板内等宽红色错误行：替代 toast 式错误提示。 */
function ErrorLine({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 border-l-2 border-[var(--t-hazard)] pl-3 font-mono text-[11px] leading-6 tracking-[0.12em] text-[var(--t-hazard)]"
    >
      ERR // {message}
    </p>
  );
}

/** 闸口点火前的启动画面：等宽终端风极简加载。 */
function GateBoot() {
  const { t } = useTranslation();
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-[#000000] text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-9 w-9">
          <div className="absolute inset-0 border border-[var(--t-noise)]" />
          <div className="absolute inset-0 animate-[t-spin-step_1s_steps(8)_infinite] border-t border-[var(--t-accent)] motion-reduce:animate-none" />
          <div className="absolute inset-[7px] animate-[t-blink_1.6s_steps(1)_infinite] bg-[var(--t-accent)]/20 motion-reduce:animate-none" />
        </div>
        <span className="t-mono text-[var(--t-faint)]">{t('app.loading')}</span>
        <span className="t-mono text-[var(--t-faint)]">SYS // GATE.BOOT</span>
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
  return <span className="t-mono text-[var(--t-faint)]">{text}</span>;
}

function Field({
  label,
  code,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
  required = true,
}: {
  label: string;
  code: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className={FIELD_LABEL_CLASS}>{label}</span>
        <span aria-hidden className="font-mono text-[9px] tracking-[0.2em] text-[var(--t-faint)]">
          [{code}]
        </span>
      </span>
      <TInput
        className="mt-1.5 h-11"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function EmailCodeRow({
  code,
  value,
  setValue,
  sendCode,
  prepareResend,
  sending,
  sent,
  requiresTurnstile,
}: {
  code: string;
  value: string;
  setValue: (value: string) => void;
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
      <span className="flex items-baseline justify-between gap-3">
        <span className={FIELD_LABEL_CLASS}>{t('auth.verificationCode')}</span>
        <span aria-hidden className="font-mono text-[9px] tracking-[0.2em] text-[var(--t-faint)]">
          [{code}]
        </span>
      </span>
      <div className="mt-1.5 flex gap-2">
        <TInput
          className="h-11"
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/\D/gu, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="000000"
          aria-label={t('auth.verificationCode')}
        />
        <TButton
          type="button"
          variant="secondary"
          className="self-center"
          onClick={handleClick}
          disabled={sending || initialSendBlocked}
          title={initialSendBlocked ? t('auth.turnstileRequired') : undefined}
        >
          {sending ? t('auth.sendingCode') : sent ? t('auth.resendCode') : t('auth.sendCode')}
        </TButton>
      </div>
      {initialSendBlocked && (
        <span className="mt-1 block text-[11px] text-[var(--t-signal)]">{t('auth.turnstileRequired')}</span>
      )}
    </div>
  );
}

function TurnstileVerified() {
  const { t } = useTranslation();
  return (
    <div className="t-mono border border-[var(--t-accent)]/30 bg-[var(--t-accent)]/5 px-3 py-2 text-center text-[var(--t-accent)]">
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
          className="peer absolute inset-0 h-full w-full appearance-none border border-[var(--t-faint)] bg-black transition-colors duration-100 [transition-timing-function:steps(2,end)] checked:border-[var(--t-accent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--t-accent)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] hidden bg-[var(--t-accent)] peer-checked:block"
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
