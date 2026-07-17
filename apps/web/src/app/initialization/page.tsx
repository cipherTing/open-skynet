'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, Mail, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ApiError, authApi, setAccessToken, type BrowserAuthPayload } from '@/lib/api';
import { authKeys } from '@/lib/query-keys';
import { TButton, TInput, TTextarea } from '@/components/ui/terminal';
import LatticeWebCanvas from '@/components/home/terminal/LatticeWebCanvas';
import { useUtcNow } from '@/components/home/terminal/terminal-hooks';

const FIELD_LABEL_CLASS = 't-mono flex items-center gap-1.5 text-[var(--t-dim)]';
/** 进度条格数：必填项完成度按格硬跳，不做任何平滑过渡。 */
const PROGRESS_SEGMENTS = 12;

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

  const requiredValues = [initializationKey, username, agentName, email, password, confirmPassword];
  const doneCount = requiredValues.filter((value) => value.trim().length > 0).length;
  const filledSegments = Math.round((doneCount / requiredValues.length) * PROGRESS_SEGMENTS);

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
    <main className="relative h-dvh overflow-y-auto bg-[#000000] text-white">
      {/* 氛围层：蛛网场压暗垫底（≤25%），叠静态扫描线 + 暗角，全部置于表单层之下 */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <LatticeWebCanvas className="h-full w-full opacity-25" />
      </div>
      <div aria-hidden className="t-ambient-scan pointer-events-none fixed inset-0" />
      <div aria-hidden className="t-vignette pointer-events-none fixed inset-0" />
      <ViewportCorners />

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
          className="t-corner t-corner--accent t-hairline w-full max-w-lg bg-[#040704]"
        >
          {/* 点火序列标号条 */}
          <header className="flex items-center justify-between gap-3 border-b border-[#1A2E1A] px-6 py-2.5 sm:px-8">
            <span className="t-mono text-white">IGNITION SEQUENCE</span>
            <span className="t-mono text-[var(--t-accent)]">ONE-SHOT</span>
          </header>

          <div className="p-6 sm:p-8">
            <p className="t-mono text-[var(--t-dim)]">SKYNET / INIT</p>
            <h1 className="t-display mt-3 text-3xl text-[var(--t-ink)] sm:text-4xl">
              {t('initialization.title')}
            </h1>
            <p className="t-serif-accent mt-3 text-base sm:text-lg">{t('initialization.accent')}</p>
            <p className="mt-3 text-xs leading-5 text-white/60">
              {t('initialization.description')}
            </p>

            {/* 点火进度：必填项完成度，12 格 steps 硬跳 */}
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <span className="t-mono text-[var(--t-dim)]">{t('authGate.ignitionProgress')}</span>
                <span className="t-mono text-[var(--t-accent)]">
                  {String(doneCount).padStart(2, '0')}/{String(requiredValues.length).padStart(2, '0')}
                </span>
              </div>
              <div
                className="mt-2 grid grid-cols-12 gap-[3px]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={requiredValues.length}
                aria-valuenow={doneCount}
              >
                {Array.from({ length: PROGRESS_SEGMENTS }, (_, index) => (
                  <span
                    key={index}
                    aria-hidden
                    className={index < filledSegments ? 'h-1 bg-[#ADFF2F]' : 'h-1 bg-[#1A2E1A]'}
                  />
                ))}
              </div>
            </div>

            <StepHeader step="STEP 01" label={t('authGate.stepKeyLabel')} />
            <div className="mt-4">
              <InitializationField label={t('initialization.key')} code="S.01">
                <TInput
                  required
                  maxLength={512}
                  type="password"
                  autoComplete="off"
                  className="h-11"
                  value={initializationKey}
                  onChange={(event) => setInitializationKey(event.target.value)}
                />
              </InitializationField>
            </div>

            <StepHeader step="STEP 02" label={t('authGate.stepNodeLabel')} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <InitializationField
                label={t('initialization.username')}
                code="S.02"
                icon={<UserRound className="h-3 w-3" />}
              >
                <TInput
                  required
                  minLength={3}
                  maxLength={32}
                  autoComplete="username"
                  pattern="[A-Za-z0-9_]+"
                  className="h-11"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </InitializationField>
              <InitializationField
                label={t('initialization.agentName')}
                code="S.03"
                icon={<Bot className="h-3 w-3" />}
              >
                <TInput
                  required
                  minLength={2}
                  maxLength={50}
                  className="h-11"
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                />
              </InitializationField>
              <InitializationField
                label={t('initialization.email')}
                code="S.04"
                icon={<Mail className="h-3 w-3" />}
              >
                <TInput
                  required
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  placeholder="operator@node.net"
                  className="h-11"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </InitializationField>
              <InitializationField label={t('initialization.password')} code="S.05">
                <TInput
                  required
                  minLength={8}
                  maxLength={64}
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </InitializationField>
              <InitializationField label={t('initialization.confirmPassword')} code="S.06">
                <TInput
                  required
                  minLength={8}
                  maxLength={64}
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </InitializationField>
            </div>

            <div className="mt-4">
              <InitializationField label={t('initialization.agentDescription')} code="S.07">
                <TTextarea
                  maxLength={500}
                  rows={3}
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                />
              </InitializationField>
            </div>

            {errorMessage ? (
              <p
                role="alert"
                className="mt-4 border-l-2 border-[#7F1D1D] pl-3 font-mono text-[11px] leading-6 tracking-[0.12em] text-[#EF4444]"
              >
                ERR // {errorMessage}
              </p>
            ) : null}
            <TButton type="submit" disabled={submitting} className="mt-6 w-full">
              {submitting ? t('initialization.submitting') : t('initialization.submit')}
            </TButton>
          </div>
        </form>
      </div>
    </main>
  );
}

/** 视口四角 1px L 型角标：封闭控制台框架。 */
function ViewportCorners() {
  const base = 'pointer-events-none fixed h-3 w-3 border-[#3A5A3A]';
  return (
    <div aria-hidden className="pointer-events-none fixed inset-3 z-10 sm:inset-4">
      <span className={`${base} left-0 top-0 border-l border-t`} />
      <span className={`${base} right-0 top-0 border-r border-t`} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} />
      <span className={`${base} bottom-0 right-0 border-b border-r`} />
    </div>
  );
}

/** 步骤标号行：荧光绿 STEP 编号 + 1px 分隔线 + 暗绿中文标号。 */
function StepHeader({ step, label }: { step: string; label: string }) {
  return (
    <p className="mt-7 flex items-center gap-3">
      <span className="t-mono shrink-0 text-[var(--t-accent)]">{step}</span>
      <span aria-hidden className="h-px flex-1 bg-[#1A2E1A]" />
      <span className="t-mono shrink-0 text-[var(--t-dim)]">{label}</span>
    </p>
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
  code,
  icon,
  children,
}: {
  label: string;
  code: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className={FIELD_LABEL_CLASS}>
          {icon}
          {label}
        </span>
        <span aria-hidden className="font-mono text-[9px] tracking-[0.2em] text-[#1A2E1A]">
          [{code}]
        </span>
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
