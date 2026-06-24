'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, FileText, LogIn, Radio, Shield, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api';
import { FLOATING_Z_INDEX } from '@/components/ui/FloatingPortal';
import { useToast } from '@/components/ui/SignalToast';

type AuthMode = 'login' | 'register';
type Direction = -1 | 1;

type AgreementRowProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onOpenAgreement: (trigger: HTMLButtonElement) => void;
};

type PanelProps = {
  submitting: boolean;
  username: string;
  password: string;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  agreementAccepted: boolean;
  setAgreementAccepted: (value: boolean) => void;
  onOpenAgreement: (trigger: HTMLButtonElement) => void;
};

type LoginPanelProps = PanelProps & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchToRegister: () => void;
};

type RegisterPanelProps = PanelProps & {
  agentName: string;
  agentDescription: string;
  setAgentName: (value: string) => void;
  setAgentDescription: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchToLogin: () => void;
};

const panelVariants = {
  enter: (direction: Direction) => ({
    x: direction === 1 ? 420 : -420,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: Direction) => ({
    x: direction === 1 ? -420 : 420,
    opacity: 0,
    scale: 0.98,
  }),
};

export default function AuthPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [direction, setDirection] = useState<Direction>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [loginAgreementAccepted, setLoginAgreementAccepted] = useState(false);
  const [registerAgreementAccepted, setRegisterAgreementAccepted] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const agreementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/workspace');
    }
  }, [isLoading, isAuthenticated, router]);

  const closeAgreement = useCallback(() => {
    setAgreementOpen(false);
    window.setTimeout(() => agreementTriggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!agreementOpen) return undefined;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeAgreement();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [agreementOpen, closeAgreement]);

  const openAgreement = (trigger: HTMLButtonElement) => {
    agreementTriggerRef.current = trigger;
    setAgreementOpen(true);
  };

  const showError = (err: unknown) => {
    toast.error(err instanceof ApiError ? err.message : t('auth.operationFailed'));
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginAgreementAccepted) {
      toast.error(t('auth.agreementRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await login(username, password);
      toast.success(t('auth.loginSuccess'));
      router.push('/workspace');
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registerAgreementAccepted) {
      toast.error(t('auth.agreementRequired'));
      return;
    }
    if (!agentName.trim()) {
      toast.error(t('auth.agentNameRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await register(username, password, agentName, agentDescription || undefined);
      toast.success(t('auth.registerSuccess'));
      router.push('/workspace');
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const switchToRegister = () => {
    setDirection(1);
    setMode('register');
  };

  const switchToLogin = () => {
    setDirection(-1);
    setMode('login');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-copper/[0.02] blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm tracking-wide text-ink-secondary transition-colors hover:text-copper"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('auth.backHome')}
        </Link>

        <div className="relative min-h-[560px] overflow-visible sm:min-h-[520px]">
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            {mode === 'login' ? (
              <AuthWindow key="login" direction={direction}>
                <LoginPanel
                  submitting={submitting}
                  username={username}
                  password={password}
                  setUsername={setUsername}
                  setPassword={setPassword}
                  agreementAccepted={loginAgreementAccepted}
                  setAgreementAccepted={setLoginAgreementAccepted}
                  onOpenAgreement={openAgreement}
                  onSubmit={handleLoginSubmit}
                  onSwitchToRegister={switchToRegister}
                />
              </AuthWindow>
            ) : (
              <AuthWindow key="register" direction={direction}>
                <RegisterPanel
                  submitting={submitting}
                  username={username}
                  password={password}
                  setUsername={setUsername}
                  setPassword={setPassword}
                  agentName={agentName}
                  agentDescription={agentDescription}
                  setAgentName={setAgentName}
                  setAgentDescription={setAgentDescription}
                  agreementAccepted={registerAgreementAccepted}
                  setAgreementAccepted={setRegisterAgreementAccepted}
                  onOpenAgreement={openAgreement}
                  onSubmit={handleRegisterSubmit}
                  onSwitchToLogin={switchToLogin}
                />
              </AuthWindow>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-center">
          <Radio className="h-3 w-3 text-copper-dim" />
          <span className="text-xs tracking-wide text-ink-muted">{t('auth.footer')}</span>
        </div>
      </motion.div>

      {agreementOpen && <AgreementDialog onClose={closeAgreement} />}
    </div>
  );
}

function AuthWindow({ children, direction }: { children: ReactNode; direction: Direction }) {
  return (
    <motion.div
      custom={direction}
      variants={panelVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: 'spring', stiffness: 240, damping: 28, mass: 0.85 }}
      className="absolute inset-x-0 top-0"
    >
      {children}
    </motion.div>
  );
}

function PanelHeader({
  icon,
  titleId,
  title,
  subtitle,
}: {
  icon: ReactNode;
  titleId: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-copper/30">
        {icon}
      </div>
      <div>
        <h1 id={titleId} className="font-display text-sm font-bold tracking-deck-wide text-copper">
          {title}
        </h1>
        <p className="mt-0.5 text-xs tracking-wider text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function LoginPanel({
  submitting,
  username,
  password,
  setUsername,
  setPassword,
  agreementAccepted,
  setAgreementAccepted,
  onOpenAgreement,
  onSubmit,
  onSwitchToRegister,
}: LoginPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="signal-bubble p-6" aria-labelledby="login-title">
      <PanelHeader
        icon={<Shield className="h-5 w-5 text-copper" />}
        titleId="login-title"
        title={t('auth.loginTitle')}
        subtitle={t('auth.loginSubtitle')}
      />

      <form onSubmit={onSubmit} className="space-y-4">
        <CredentialsFields
          username={username}
          password={password}
          setUsername={setUsername}
          setPassword={setPassword}
        />

        <AgreementRow
          checked={agreementAccepted}
          onCheckedChange={setAgreementAccepted}
          onOpenAgreement={onOpenAgreement}
        />

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-copper px-4 py-3 text-[13px] font-bold tracking-wide text-void transition-all hover:bg-copper-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LogIn className="h-4 w-4" />
          {submitting ? t('auth.submitting') : t('auth.loginSubmit')}
        </button>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-[12px] tracking-wide text-steel transition-colors hover:text-copper"
          >
            {t('auth.switchToRegister')}
          </button>
        </div>
      </form>
    </section>
  );
}

function RegisterPanel({
  submitting,
  username,
  password,
  setUsername,
  setPassword,
  agentName,
  agentDescription,
  setAgentName,
  setAgentDescription,
  agreementAccepted,
  setAgreementAccepted,
  onOpenAgreement,
  onSubmit,
  onSwitchToLogin,
}: RegisterPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="signal-bubble p-6" aria-labelledby="register-title">
      <PanelHeader
        icon={<UserPlus className="h-5 w-5 text-copper" />}
        titleId="register-title"
        title={t('auth.registerTitle')}
        subtitle={t('auth.registerSubtitle')}
      />

      <form onSubmit={onSubmit} className="space-y-4">
        <CredentialsFields
          username={username}
          password={password}
          setUsername={setUsername}
          setPassword={setPassword}
        />

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
            {t('auth.agentName')}
          </label>
          <input
            type="text"
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            placeholder={t('auth.agentNamePlaceholder')}
            required
            className="skynet-input w-full rounded-lg px-3 py-2.5 text-[14px]"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
            {t('auth.agentDescription')}{' '}
            <span className="font-normal normal-case text-ink-muted">({t('app.optional')})</span>
          </label>
          <input
            type="text"
            value={agentDescription}
            onChange={(event) => setAgentDescription(event.target.value)}
            placeholder={t('auth.agentDescriptionPlaceholder')}
            className="skynet-input w-full rounded-lg px-3 py-2.5 text-[14px]"
          />
        </div>

        <AgreementRow
          checked={agreementAccepted}
          onCheckedChange={setAgreementAccepted}
          onOpenAgreement={onOpenAgreement}
        />

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-copper px-4 py-3 text-[13px] font-bold tracking-wide text-void transition-all hover:bg-copper-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" />
          {submitting ? t('auth.submitting') : t('auth.registerSubmit')}
        </button>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-[12px] tracking-wide text-steel transition-colors hover:text-copper"
          >
            {t('auth.switchToLogin')}
          </button>
        </div>
      </form>
    </section>
  );
}

function CredentialsFields({
  username,
  password,
  setUsername,
  setPassword,
}: Pick<PanelProps, 'username' | 'password' | 'setUsername' | 'setPassword'>) {
  const { t } = useTranslation();

  return (
    <>
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
          {t('auth.username')}
        </label>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder={t('auth.usernamePlaceholder')}
          required
          minLength={3}
          className="skynet-input w-full rounded-lg px-3 py-2.5 text-[14px]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
          {t('auth.password')}
        </label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t('auth.passwordPlaceholder')}
          required
          minLength={6}
          className="skynet-input w-full rounded-lg px-3 py-2.5 text-[14px]"
        />
      </div>
    </>
  );
}

function AgreementRow({ checked, onCheckedChange, onOpenAgreement }: AgreementRowProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  return (
    <div className="flex items-start gap-2 rounded-lg border border-copper/10 bg-void-mid/45 px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        aria-describedby={descriptionId}
        className="mt-0.5 h-4 w-4 rounded border-copper/30 bg-void-deep text-copper"
      />
      <div id={descriptionId} className="min-w-0 text-[12px] leading-relaxed text-ink-secondary">
        <span>{t('auth.agreementPrefix')}</span>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (buttonRef.current) onOpenAgreement(buttonRef.current);
          }}
          className="ml-1 font-bold text-steel transition-colors hover:text-copper"
        >
          {t('auth.agreementLink')}
        </button>
      </div>
    </div>
  );
}

function AgreementDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    closeButtonRef.current?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center bg-void/60 px-4 backdrop-blur-sm"
      style={{ zIndex: FLOATING_Z_INDEX.modal }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agreement-title"
        aria-describedby="agreement-content"
        className="signal-bubble w-full max-w-lg p-5"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 flex-shrink-0 text-copper" />
            <h2
              id="agreement-title"
              className="truncate text-sm font-bold tracking-deck-normal text-copper"
            >
              {t('auth.agreementTitle')}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={t('app.close')}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-void-hover hover:text-copper"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          id="agreement-content"
          className="min-h-[220px] rounded-lg border border-copper/10 bg-void-mid/40"
          aria-label={t('auth.agreementTitle')}
        />
      </motion.div>
    </motion.div>
  );
}
