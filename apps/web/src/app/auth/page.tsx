'use client';

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Turnstile } from '@marsidev/react-turnstile';
import { ArrowLeft, KeyRound, LogIn, Mail, Shield, UserPlus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { authApi, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/SignalToast';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';

type AuthMode = 'login' | 'register' | 'forgot';

export default function AuthPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
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

  if (isLoading || configQuery.isPending) return <LoadingScreen />;
  if (isUnavailable || configQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState
          title={t('auth.serviceUnavailableTitle')}
          message={t('auth.serviceUnavailableMessage')}
          onAction={() => {
            void retrySession();
            void configQuery.refetch();
          }}
        />
      </div>
    );
  }

  const showTurnstile = Boolean(
    config?.turnstileEnabled && (mode === 'login' || !challengeId || resendPreparing),
  );
  const turnstile = showTurnstile ? (
    <div className="flex justify-center rounded-lg border border-copper/10 bg-void-mid/50 p-2">
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

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(232,111,53,0.05),transparent_55%)]" />
      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-ink-secondary transition-colors hover:text-copper"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('auth.backHome')}
        </Link>
        <AnimatePresence mode="wait">
          <motion.section
            key={mode}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
            className="signal-bubble p-6"
          >
            <AuthHeader mode={mode} />
            {mode === 'login' && (
              <form onSubmit={submitLogin} className="space-y-4">
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
                <PrimaryButton
                  disabled={
                    submitting ||
                    !agreementAccepted ||
                    Boolean(config?.turnstileEnabled && !turnstileToken)
                  }
                  icon={<LogIn className="h-4 w-4" />}
                  label={submitting ? t('auth.submitting') : t('auth.loginSubmit')}
                />
                <div className="flex justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => changeMode('forgot')}
                    className="text-ink-muted hover:text-copper"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMode('register')}
                    className="text-steel hover:text-copper"
                  >
                    {t('auth.switchToRegister')}
                  </button>
                </div>
              </form>
            )}
            {mode === 'register' && (
              <form onSubmit={submitRegister} className="space-y-4">
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
                <PrimaryButton
                  disabled={
                    submitting ||
                    !agreementAccepted ||
                    !challengeId ||
                    verificationCode.length !== 6 ||
                    Boolean(config?.inviteRequired && !invitationCode)
                  }
                  icon={<UserPlus className="h-4 w-4" />}
                  label={submitting ? t('auth.submitting') : t('auth.registerSubmit')}
                />
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                  className="w-full text-center text-xs text-steel hover:text-copper"
                >
                  {t('auth.switchToLogin')}
                </button>
              </form>
            )}
            {mode === 'forgot' && (
              <form onSubmit={submitReset} className="space-y-4">
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
                <PrimaryButton
                  disabled={submitting || !challengeId || verificationCode.length !== 6}
                  icon={<KeyRound className="h-4 w-4" />}
                  label={submitting ? t('auth.submitting') : t('auth.resetPassword')}
                />
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                  className="w-full text-center text-xs text-steel hover:text-copper"
                >
                  {t('auth.switchToLogin')}
                </button>
              </form>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
      {agreementOpen && <AgreementDialog close={() => setAgreementOpen(false)} />}
    </main>
  );
}

function AuthHeader({ mode }: { mode: AuthMode }) {
  const { t } = useTranslation();
  const values =
    mode === 'login'
      ? {
          icon: <Shield className="h-5 w-5" />,
          title: t('auth.loginTitle'),
          subtitle: t('auth.loginSubtitle'),
        }
      : mode === 'register'
        ? {
            icon: <UserPlus className="h-5 w-5" />,
            title: t('auth.registerTitle'),
            subtitle: t('auth.registerSubtitle'),
          }
        : {
            icon: <Mail className="h-5 w-5" />,
            title: t('auth.forgotTitle'),
            subtitle: t('auth.forgotSubtitle'),
          };
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-copper/30 text-copper">
        {values.icon}
      </div>
      <div>
        <h1 className="font-display text-sm font-bold tracking-deck-wide text-copper">
          {values.title}
        </h1>
        <p className="mt-0.5 text-xs text-ink-muted">{values.subtitle}</p>
      </div>
    </div>
  );
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
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="skynet-input w-full rounded-lg px-3 py-2.5 text-sm"
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
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
        {t('auth.verificationCode')}
      </span>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))}
          inputMode="numeric"
          className="skynet-input min-w-0 flex-1 rounded-lg px-3 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={handleClick}
          disabled={sending || initialSendBlocked}
          title={initialSendBlocked ? t('auth.turnstileRequired') : undefined}
          className="rounded-lg border border-copper/25 px-3 text-xs text-copper transition-colors hover:bg-copper/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? t('auth.sendingCode') : sent ? t('auth.resendCode') : t('auth.sendCode')}
        </button>
      </div>
      {initialSendBlocked && (
        <span className="mt-1 block text-[11px] text-ochre">{t('auth.turnstileRequired')}</span>
      )}
    </label>
  );
}

function TurnstileVerified() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-moss/20 bg-moss/5 px-3 py-2 text-center text-xs font-medium text-moss">
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
    <div className="flex items-start gap-2 text-xs text-ink-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
        className="mt-0.5"
      />
      <span>
        {t('auth.agreementPrefix')}
        <button type="button" onClick={open} className="ml-1 text-steel hover:text-copper">
          {t('auth.agreementLink')}
        </button>
      </span>
    </div>
  );
}

function PrimaryButton({
  disabled,
  icon,
  label,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-copper px-4 py-3 text-[13px] font-bold text-void transition-colors hover:bg-copper-dim disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

function AgreementDialog({ close }: { close: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-void/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="signal-bubble max-h-[80vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-copper">{t('auth.agreementTitle')}</h2>
          <button type="button" onClick={close} aria-label={t('app.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="whitespace-pre-line text-sm leading-7 text-ink-secondary">
          {t('auth.agreementBody')}
        </p>
      </div>
    </div>
  );
}
