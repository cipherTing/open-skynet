'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, Mail, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ApiError, authApi, setAccessToken, type BrowserAuthPayload } from '@/lib/api';
import { authKeys } from '@/lib/query-keys';
import { TButton, TInput, TTextarea } from '@/components/ui/terminal';
import AsciiCoreCanvas from '@/components/home/terminal/AsciiCoreCanvas';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';

const FIELD_LABEL_CLASS = 't-mono flex items-center gap-1.5 text-[var(--t-dim)]';

export default function InitializationRoutePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const finishInitialization = (session?: BrowserAuthPayload) => {
    if (session) {
      setAccessToken(session.token);
      queryClient.setQueryData(authKeys.session(), session);
    }
    queryClient.setQueryData(authKeys.initialization(), { initialized: true });
    router.replace('/workspace');
  };

  return <InitializationForm onInitialized={finishInitialization} />;
}

function InitializationForm({
  onInitialized,
}: {
  onInitialized: (session?: BrowserAuthPayload) => void;
}) {
  const { t } = useTranslation();
  const [initializationKey, setInitializationKey] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    if (password !== confirmPassword) {
      setErrorMessage(t('initialization.passwordMismatch'));
      return;
    }
    const normalizedUsername = username.trim();
    const normalizedAgentName = agentName.trim();
    if (!/^[a-zA-Z0-9_]+$/.test(normalizedUsername)) {
      setErrorMessage(t('initialization.usernameInvalid'));
      return;
    }
    if (!/^(?=.*[a-zA-Z])(?=.*\d).+$/.test(password)) {
      setErrorMessage(t('initialization.passwordInvalid'));
      return;
    }
    if (new TextEncoder().encode(password).byteLength > 72) {
      setErrorMessage(t('initialization.passwordTooLong'));
      return;
    }
    if (!normalizedAgentName) {
      setErrorMessage(t('initialization.agentNameRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const session = await authApi.initializeAdministrator({
        initializationKey,
        username: normalizedUsername,
        email: email.trim().toLowerCase(),
        password,
        agentName: normalizedAgentName,
        agentDescription: agentDescription.trim() || undefined,
      });
      onInitialized(session);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 403) {
        setErrorMessage(t('initialization.keyInvalid'));
        return;
      }
      if (error instanceof ApiError && error.statusCode === 409) {
        try {
          const status = await authApi.initializationStatus();
          if (status.initialized) {
            onInitialized();
            return;
          }
        } catch {
          setErrorMessage(t('initialization.unavailableMessage'));
          return;
        }
      }
      setErrorMessage(t('initialization.failed'));
    } finally {
      setInitializationKey('');
      setSubmitting(false);
    }
  };

  return (
    <main className="t-terminal-scope relative h-dvh overflow-y-auto bg-[#000000] text-white">
      {/* 氛围层：字符核心低透明度垫底，随视口固定，表单层之上不可见 */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <AsciiCoreCanvas className="h-full w-full opacity-30" />
      </div>
      <div aria-hidden className="t-vignette pointer-events-none fixed inset-0" />

      <header className="pointer-events-none fixed inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <span className="t-mono text-[var(--t-dim)]">SKYNET // INIT SEQUENCE</span>
        <GateClock />
      </header>
      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <span className="t-mono text-[var(--t-dim)]">INIT.00 // ONE-SHOT</span>
        <span className="t-mono hidden text-[var(--t-dim)] sm:inline">IGNITION.PROTOCOL</span>
      </footer>

      <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-16 sm:py-20">
        <form
          onSubmit={handleSubmit}
          className="t-corner t-corner--accent t-hairline w-full max-w-lg bg-[#040704] p-6 sm:p-8"
        >
          <p className="t-mono text-[var(--t-accent)]">SKYNET / INIT</p>
          <h1 className="t-display mt-3 text-3xl text-[var(--t-ink)] sm:text-4xl">
            {t('initialization.title')}
          </h1>
          <p className="t-serif-accent mt-3 text-base sm:text-lg">{t('initialization.accent')}</p>
          <p className="mt-3 text-xs leading-5 text-white/60">
            {t('initialization.description')}
          </p>

          <div className="mt-7">
            <InitializationField label={t('initialization.key')}>
              <TInput
                required
                maxLength={512}
                type="password"
                autoComplete="off"
                value={initializationKey}
                onChange={(event) => setInitializationKey(event.target.value)}
              />
            </InitializationField>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InitializationField
              label={t('initialization.username')}
              icon={<UserRound className="h-3 w-3" />}
            >
              <TInput
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
                pattern="[A-Za-z0-9_]+"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </InitializationField>
            <InitializationField
              label={t('initialization.agentName')}
              icon={<Bot className="h-3 w-3" />}
            >
              <TInput
                required
                minLength={2}
                maxLength={50}
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
              />
            </InitializationField>
            <InitializationField
              label={t('initialization.email')}
              icon={<Mail className="h-3 w-3" />}
            >
              <TInput
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </InitializationField>
            <InitializationField label={t('initialization.password')}>
              <TInput
                required
                minLength={8}
                maxLength={64}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </InitializationField>
            <InitializationField label={t('initialization.confirmPassword')}>
              <TInput
                required
                minLength={8}
                maxLength={64}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </InitializationField>
          </div>

          <div className="mt-4">
            <InitializationField label={t('initialization.agentDescription')}>
              <TTextarea
                maxLength={500}
                rows={3}
                value={agentDescription}
                onChange={(event) => setAgentDescription(event.target.value)}
              />
            </InitializationField>
          </div>

          {errorMessage ? (
            <p className="t-mono mt-4 border-l-2 border-[#A16207] pl-3 text-[#A16207]">
              {errorMessage}
            </p>
          ) : null}
          <TButton type="submit" disabled={submitting} className="mt-6 w-full">
            {submitting ? t('initialization.submitting') : t('initialization.submit')}
          </TButton>
        </form>
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

function InitializationField({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={FIELD_LABEL_CLASS}>
        {icon}
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
