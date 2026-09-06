'use client';

import { KeyRound, LogIn, UserPlus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAppForm } from '@/components/forms/skynet-form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/SignalToast';
import { TButton } from '@/components/ui/terminal';
import { ApiError, authApi, type AuthPublicConfig } from '@/lib/api';
import {
  getEmailVerificationSendEligibility,
  normalizeAuthenticationEmail,
} from '@/lib/turnstile-verification';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const PASSWORD_MAX_UTF8_BYTES = 72;
const AGENT_NAME_MIN_LENGTH = 2;
const AGENT_NAME_MAX_LENGTH = 50;
const AGENT_DESCRIPTION_MAX_LENGTH = 500;
const INVITATION_CODE_MAX_LENGTH = 128;
const VERIFICATION_CODE_LENGTH = 6;

interface CommonFormProps {
  config: AuthPublicConfig;
  onOpenAgreement: () => void;
  turnstile: AuthTurnstileControl;
}

interface AuthTurnstileControl {
  enabled: boolean;
  ready: boolean;
  takeToken: () => string | undefined;
  resetAfterRequest: () => void;
}

interface EmailVerificationCooldownControl {
  until: number | null;
  now: number;
  start: () => void;
}

interface LoginFormProps extends CommonFormProps {
  login: (identity: string, password: string, turnstileToken?: string) => Promise<void>;
}

interface RegisterFormProps extends CommonFormProps {
  register: (input: Parameters<typeof authApi.register>[0]) => Promise<void>;
  verificationCooldown: EmailVerificationCooldownControl;
}

function passwordSchema(t: (key: string) => string) {
  return z
    .string()
    .min(PASSWORD_MIN_LENGTH, t('auth.validation.passwordLength'))
    .max(PASSWORD_MAX_LENGTH, t('auth.validation.passwordLength'))
    .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_UTF8_BYTES, {
      message: t('auth.validation.passwordBytes'),
    })
    .refine((value) => /[A-Za-z]/u.test(value) && /\d/u.test(value), {
      message: t('auth.validation.passwordPattern'),
    });
}

function emailSchema(t: (key: string) => string) {
  return z
    .string()
    .trim()
    .email(t('auth.validation.email'))
    .max(EMAIL_MAX_LENGTH, t('auth.validation.email'));
}

function getAuthErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-4 border-l-2 border-[var(--t-hazard)] pl-3 font-sans text-[12px] leading-6 tracking-normal text-[var(--t-hazard)]"
    >
      ERR // {message}
    </p>
  );
}

function AgreementField({
  checked,
  onCheckedChange,
  onOpen,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const checkboxId = useId();
  const labelId = `${checkboxId}-label`;
  return (
    <div className="flex items-start gap-2.5 text-xs leading-5 text-white/60">
      <Checkbox
        id={checkboxId}
        aria-labelledby={labelId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span id={labelId}>
        {t('auth.agreementPrefix')}
        <button
          type="button"
          onClick={onOpen}
          className="ml-1 text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:underline"
        >
          {t('auth.agreementLink')}
        </button>
      </span>
    </div>
  );
}

export function LoginForm({ login, onOpenAgreement, turnstile }: LoginFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [errorMessage, setErrorMessage] = useState('');
  const form = useAppForm({
    defaultValues: {
      identity: '',
      password: '',
      agreementAccepted: false,
    },
    validators: {
      onSubmit: z.object({
        identity: z.string().trim().min(1, t('auth.validation.required')),
        password: z.string().min(1, t('auth.validation.required')),
        agreementAccepted: z.boolean().refine(Boolean, t('auth.agreementRequired')),
      }),
    },
    onSubmit: async ({ value }) => {
      setErrorMessage('');
      const turnstileToken = turnstile.takeToken();
      if (turnstile.enabled && !turnstileToken) {
        const message = t('auth.turnstileRequired');
        setErrorMessage(message);
        toast.error(message);
        return;
      }
      try {
        await login(value.identity, value.password, turnstileToken);
        toast.success(t('auth.loginSuccess'));
      } catch (error) {
        const message = getAuthErrorMessage(error, t('auth.operationFailed'));
        setErrorMessage(message);
        toast.error(message);
      } finally {
        if (turnstile.enabled) turnstile.resetAfterRequest();
      }
    },
  });

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <ErrorLine message={errorMessage} />
        <form.AppField name="identity">
          {(field) => (
            <field.InputField
              label={t('auth.identity')}
              code="F.01"
              autoComplete="username"
              className="h-11"
            />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.InputField
              label={t('auth.password')}
              code="F.02"
              type="password"
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
              className="h-11"
            />
          )}
        </form.AppField>
        <form.AppField name="agreementAccepted">
          {(field) => (
            <AgreementField
              checked={field.state.value}
              onCheckedChange={field.handleChange}
              onOpen={onOpenAgreement}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.agreementAccepted}>
          {(agreementAccepted) => (
            <form.SubmitButton
              className="w-full"
              disabled={!agreementAccepted || (turnstile.enabled && !turnstile.ready)}
              submittingContent={t('auth.submitting')}
            >
              <LogIn className="h-3.5 w-3.5" />
              {t('auth.loginSubmit')}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.AppForm>
    </form>
  );
}

function VerificationCodeField({
  formField,
  code,
  sending,
  sent,
  canSend,
  cooldownSeconds,
  errorMessage,
  onSend,
}: {
  formField: ReactNode;
  code: string;
  sending: boolean;
  sent: boolean;
  canSend: boolean;
  cooldownSeconds: number;
  errorMessage: string;
  onSend: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">{formField}</div>
        <TButton
          type="button"
          variant="secondary"
          className="mb-0.5"
          disabled={!canSend}
          onClick={onSend}
        >
          {sending
            ? t('auth.sendingCode')
            : cooldownSeconds > 0
              ? t('auth.resendCountdown', { seconds: cooldownSeconds })
              : sent
                ? t('auth.resendCode')
                : t('auth.sendCode')}
        </TButton>
      </div>
      {errorMessage ? (
        <span
          role="alert"
          className="mt-1 block font-sans text-[11px] leading-5 text-[var(--t-hazard)]"
        >
          {errorMessage}
        </span>
      ) : null}
      <span className="sr-only">{code}</span>
    </div>
  );
}

export function RegisterForm({
  config,
  register,
  onOpenAgreement,
  turnstile,
  verificationCooldown,
}: RegisterFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [challengeId, setChallengeId] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verificationErrorMessage, setVerificationErrorMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const registrationEmailSchema = emailSchema(t);
  const form = useAppForm({
    defaultValues: {
      username: '',
      email: '',
      verificationCode: '',
      password: '',
      agentName: '',
      agentDescription: '',
      invitationCode: '',
      agreementAccepted: false,
    },
    validators: {
      onSubmit: z.object({
        username: z
          .string()
          .trim()
          .min(USERNAME_MIN_LENGTH, t('auth.validation.usernameLength'))
          .max(USERNAME_MAX_LENGTH, t('auth.validation.usernameLength'))
          .regex(/^[A-Za-z0-9_]+$/u, t('auth.validation.usernamePattern')),
        email: registrationEmailSchema,
        verificationCode: z.string().regex(/^\d{6}$/u, t('auth.validation.verificationCode')),
        password: passwordSchema(t),
        agentName: z
          .string()
          .trim()
          .min(AGENT_NAME_MIN_LENGTH, t('auth.validation.agentNameLength'))
          .max(AGENT_NAME_MAX_LENGTH, t('auth.validation.agentNameLength')),
        agentDescription: z
          .string()
          .max(AGENT_DESCRIPTION_MAX_LENGTH, t('auth.validation.descriptionLength')),
        invitationCode: config.inviteRequired
          ? z
              .string()
              .trim()
              .min(1, t('auth.validation.invitationRequired'))
              .max(INVITATION_CODE_MAX_LENGTH, t('auth.validation.invitationLength'))
          : z.string().max(INVITATION_CODE_MAX_LENGTH, t('auth.validation.invitationLength')),
        agreementAccepted: z.boolean().refine(Boolean, t('auth.agreementRequired')),
      }),
    },
    onSubmit: async ({ value }) => {
      if (!challengeId) {
        setErrorMessage(t('auth.validation.challengeRequired'));
        return;
      }
      setErrorMessage('');
      try {
        await register({
          username: value.username,
          email: normalizeAuthenticationEmail(value.email),
          password: value.password,
          agentName: value.agentName,
          agentDescription: value.agentDescription || undefined,
          verificationChallengeId: challengeId,
          verificationCode: value.verificationCode,
          invitationCode: value.invitationCode || undefined,
        });
        toast.success(t('auth.registerSuccess'));
      } catch (error) {
        const message = getAuthErrorMessage(error, t('auth.operationFailed'));
        setErrorMessage(message);
        toast.error(message);
      }
    },
  });

  const resetChallenge = () => {
    setChallengeId('');
    setVerificationErrorMessage('');
    form.setFieldValue('verificationCode', '');
  };

  const sendCode = async () => {
    const email = normalizeAuthenticationEmail(form.state.values.email);
    const eligibility = getEmailVerificationSendEligibility({
      email,
      turnstileEnabled: turnstile.enabled,
      turnstileReady: turnstile.ready,
      cooldownUntil: verificationCooldown.until,
      now: Date.now(),
      sending: sendingCode,
    });
    if (!eligibility.canSend) return;
    const turnstileToken = turnstile.takeToken();
    if (turnstile.enabled && !turnstileToken) {
      const message = t('auth.turnstileRequired');
      setVerificationErrorMessage(message);
      toast.error(message);
      turnstile.resetAfterRequest();
      return;
    }
    setSendingCode(true);
    setVerificationErrorMessage('');
    setErrorMessage('');
    try {
      const result = await authApi.sendEmailVerification({
        email,
        purpose: 'REGISTER',
        turnstileToken,
      });
      setChallengeId(result.challengeId);
      verificationCooldown.start();
      toast.success(t('auth.codeSent'));
    } catch (error) {
      const message = getAuthErrorMessage(error, t('auth.operationFailed'));
      setVerificationErrorMessage(message);
      toast.error(message);
    } finally {
      setSendingCode(false);
      if (turnstile.enabled) turnstile.resetAfterRequest();
    }
  };

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <ErrorLine message={errorMessage} />
        <form.AppField name="username">
          {(field) => (
            <field.InputField
              label={t('auth.username')}
              code="R.01"
              autoComplete="username"
              placeholder={t('auth.usernamePlaceholder')}
              className="h-11"
            />
          )}
        </form.AppField>
        <form.AppField name="email" validators={{ onBlur: registrationEmailSchema }}>
          {(field) => (
            <field.InputField
              label={t('auth.email')}
              code="R.02"
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              className="h-11"
              onValueChange={resetChallenge}
            />
          )}
        </form.AppField>
        {config.inviteRequired ? (
          <p
            role="status"
            className="border-l-2 border-[var(--t-signal)] pl-3 font-sans text-[12px] leading-6 text-[var(--t-signal)]"
          >
            {t('auth.invitationRequiredNotice')}
          </p>
        ) : null}
        {config.inviteRequired ? (
          <form.AppField name="invitationCode">
            {(field) => (
              <field.InputField
                label={
                  <>
                    {t('auth.invitationCode')}{' '}
                    <span aria-hidden className="text-[var(--t-hazard)]">
                      *
                    </span>
                  </>
                }
                code="R.03"
                required={config.inviteRequired}
                className="h-11"
              />
            )}
          </form.AppField>
        ) : null}
        <form.Subscribe selector={(state) => state.values.email}>
          {(email) => {
            const eligibility = getEmailVerificationSendEligibility({
              email,
              turnstileEnabled: turnstile.enabled,
              turnstileReady: turnstile.ready,
              cooldownUntil: verificationCooldown.until,
              now: verificationCooldown.now,
              sending: sendingCode,
            });
            return (
              <form.AppField name="verificationCode">
                {(field) => (
                  <VerificationCodeField
                    code="R.04"
                    sending={sendingCode}
                    sent={Boolean(challengeId)}
                    canSend={eligibility.canSend}
                    cooldownSeconds={eligibility.cooldownSeconds}
                    errorMessage={verificationErrorMessage}
                    onSend={() => void sendCode()}
                    formField={<field.OtpField label={t('auth.verificationCode')} code="R.04" />}
                  />
                )}
              </form.AppField>
            );
          }}
        </form.Subscribe>
        <form.AppField name="password">
          {(field) => (
            <field.InputField
              label={t('auth.password')}
              code="R.05"
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.passwordPlaceholder')}
              className="h-11"
            />
          )}
        </form.AppField>
        <form.AppField name="agentName">
          {(field) => (
            <field.InputField
              label={t('auth.agentName')}
              code="R.06"
              placeholder={t('auth.agentNamePlaceholder')}
              className="h-11"
            />
          )}
        </form.AppField>
        <form.AppField name="agentDescription">
          {(field) => (
            <field.InputField
              label={t('auth.agentDescription')}
              code="R.07"
              placeholder={t('auth.agentDescriptionPlaceholder')}
              className="h-11"
            />
          )}
        </form.AppField>
        <form.AppField name="agreementAccepted">
          {(field) => (
            <AgreementField
              checked={field.state.value}
              onCheckedChange={field.handleChange}
              onOpen={onOpenAgreement}
            />
          )}
        </form.AppField>
        <form.Subscribe
          selector={(state) =>
            [
              state.values.agreementAccepted,
              state.values.verificationCode,
              state.values.invitationCode,
            ] as const
          }
        >
          {([agreementAccepted, verificationCode, invitationCode]) => (
            <form.SubmitButton
              className="w-full"
              disabled={
                !agreementAccepted ||
                !challengeId ||
                verificationCode.length !== VERIFICATION_CODE_LENGTH ||
                (config.inviteRequired && !invitationCode.trim())
              }
              submittingContent={t('auth.submitting')}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t('auth.registerSubmit')}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.AppForm>
    </form>
  );
}

export function ForgotPasswordForm({
  onComplete,
  turnstile,
  verificationCooldown,
}: {
  config: AuthPublicConfig;
  onComplete: () => void;
  turnstile: AuthTurnstileControl;
  verificationCooldown: EmailVerificationCooldownControl;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [challengeId, setChallengeId] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verificationErrorMessage, setVerificationErrorMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const resetEmailSchema = emailSchema(t);
  const form = useAppForm({
    defaultValues: { email: '', verificationCode: '', newPassword: '' },
    validators: {
      onSubmit: z.object({
        email: resetEmailSchema,
        verificationCode: z.string().regex(/^\d{6}$/u, t('auth.validation.verificationCode')),
        newPassword: passwordSchema(t),
      }),
    },
    onSubmit: async ({ value }) => {
      if (!challengeId) {
        setErrorMessage(t('auth.validation.challengeRequired'));
        return;
      }
      setErrorMessage('');
      try {
        await authApi.resetPassword({
          email: normalizeAuthenticationEmail(value.email),
          verificationChallengeId: challengeId,
          verificationCode: value.verificationCode,
          newPassword: value.newPassword,
        });
        toast.success(t('auth.passwordResetSuccess'));
        onComplete();
      } catch (error) {
        const message = getAuthErrorMessage(error, t('auth.operationFailed'));
        setErrorMessage(message);
        toast.error(message);
      }
    },
  });

  const resetChallenge = () => {
    setChallengeId('');
    setVerificationErrorMessage('');
    form.setFieldValue('verificationCode', '');
  };
  const sendCode = async () => {
    const email = normalizeAuthenticationEmail(form.state.values.email);
    const eligibility = getEmailVerificationSendEligibility({
      email,
      turnstileEnabled: turnstile.enabled,
      turnstileReady: turnstile.ready,
      cooldownUntil: verificationCooldown.until,
      now: Date.now(),
      sending: sendingCode,
    });
    if (!eligibility.canSend) return;
    const turnstileToken = turnstile.takeToken();
    if (turnstile.enabled && !turnstileToken) {
      const message = t('auth.turnstileRequired');
      setVerificationErrorMessage(message);
      toast.error(message);
      turnstile.resetAfterRequest();
      return;
    }
    setSendingCode(true);
    setVerificationErrorMessage('');
    setErrorMessage('');
    try {
      const result = await authApi.sendEmailVerification({
        email,
        purpose: 'RESET_PASSWORD',
        turnstileToken,
      });
      setChallengeId(result.challengeId);
      verificationCooldown.start();
      toast.success(t('auth.codeSent'));
    } catch (error) {
      const message = getAuthErrorMessage(error, t('auth.operationFailed'));
      setVerificationErrorMessage(message);
      toast.error(message);
    } finally {
      setSendingCode(false);
      if (turnstile.enabled) turnstile.resetAfterRequest();
    }
  };

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <ErrorLine message={errorMessage} />
        <form.AppField name="email" validators={{ onBlur: resetEmailSchema }}>
          {(field) => (
            <field.InputField
              label={t('auth.email')}
              code="K.01"
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              className="h-11"
              onValueChange={resetChallenge}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.email}>
          {(email) => {
            const eligibility = getEmailVerificationSendEligibility({
              email,
              turnstileEnabled: turnstile.enabled,
              turnstileReady: turnstile.ready,
              cooldownUntil: verificationCooldown.until,
              now: verificationCooldown.now,
              sending: sendingCode,
            });
            return (
              <form.AppField name="verificationCode">
                {(field) => (
                  <VerificationCodeField
                    code="K.02"
                    sending={sendingCode}
                    sent={Boolean(challengeId)}
                    canSend={eligibility.canSend}
                    cooldownSeconds={eligibility.cooldownSeconds}
                    errorMessage={verificationErrorMessage}
                    onSend={() => void sendCode()}
                    formField={<field.OtpField label={t('auth.verificationCode')} code="K.02" />}
                  />
                )}
              </form.AppField>
            );
          }}
        </form.Subscribe>
        <form.AppField name="newPassword">
          {(field) => (
            <field.InputField
              label={t('auth.newPassword')}
              code="K.03"
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.passwordPlaceholder')}
              className="h-11"
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.verificationCode}>
          {(verificationCode) => (
            <form.SubmitButton
              className="w-full"
              disabled={!challengeId || verificationCode.length !== VERIFICATION_CODE_LENGTH}
              submittingContent={t('auth.submitting')}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {t('auth.resetPassword')}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.AppForm>
    </form>
  );
}
