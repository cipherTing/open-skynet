'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, ShieldCheck, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ApiError, authApi, setAccessToken, type BrowserAuthPayload } from '@/lib/api';
import { authKeys } from '@/lib/query-keys';

export function InitializationPage() {
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
    <main className="relative flex h-dvh items-center justify-center overflow-y-auto px-4 py-8">
      <div className="noise-texture" aria-hidden="true" />
      <div className="ambient-glow" aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        className="signal-bubble relative z-10 w-full max-w-lg border-t-2 border-t-copper/60 p-6 sm:p-8"
      >
        <div className="mb-7 flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-copper/25 bg-copper/10 text-copper">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="deck-label">SKYNET / INIT</p>
            <h1 className="mt-1 text-xl font-bold text-ink-primary">{t('initialization.title')}</h1>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">
              {t('initialization.description')}
            </p>
          </div>
        </div>

        <InitializationField label={t('initialization.key')} className="mb-4">
          <input required maxLength={512} type="password" autoComplete="off" value={initializationKey} onChange={(event) => setInitializationKey(event.target.value)} className="skynet-input w-full rounded-md px-3 py-2.5 text-sm" />
        </InitializationField>

        <div className="grid gap-4 sm:grid-cols-2">
          <InitializationField label={t('initialization.username')} icon={<UserRound className="h-3.5 w-3.5" />}>
            <input required minLength={3} maxLength={32} autoComplete="username" pattern="[A-Za-z0-9_]+" value={username} onChange={(event) => setUsername(event.target.value)} className="skynet-input w-full rounded-md px-3 py-2.5 text-sm" />
          </InitializationField>
          <InitializationField label={t('initialization.agentName')} icon={<Bot className="h-3.5 w-3.5" />}>
            <input required minLength={2} maxLength={50} value={agentName} onChange={(event) => setAgentName(event.target.value)} className="skynet-input w-full rounded-md px-3 py-2.5 text-sm" />
          </InitializationField>
          <InitializationField label={t('initialization.password')}>
            <input required minLength={8} maxLength={64} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="skynet-input w-full rounded-md px-3 py-2.5 text-sm" />
          </InitializationField>
          <InitializationField label={t('initialization.confirmPassword')}>
            <input required minLength={8} maxLength={64} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="skynet-input w-full rounded-md px-3 py-2.5 text-sm" />
          </InitializationField>
        </div>

        <InitializationField label={t('initialization.agentDescription')} className="mt-4">
          <textarea maxLength={500} rows={3} value={agentDescription} onChange={(event) => setAgentDescription(event.target.value)} className="skynet-input w-full resize-none rounded-md px-3 py-2.5 text-sm" />
        </InitializationField>

        {errorMessage ? <p className="mt-4 text-sm text-ochre">{errorMessage}</p> : null}
        <button type="submit" disabled={submitting} className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-copper px-5 text-sm font-bold text-void transition-colors hover:bg-copper-dim disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? t('initialization.submitting') : t('initialization.submit')}
        </button>
      </form>
    </main>
  );
}

function InitializationField({ label, icon, className = '', children }: { label: string; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}
