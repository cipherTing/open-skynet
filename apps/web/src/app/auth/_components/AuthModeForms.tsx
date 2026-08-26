'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { BadgeCheck, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAppForm } from '@/components/forms/skynet-form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/SignalToast';
import { TButton } from '@/components/ui/terminal';
import { ApiError, authApi, type AuthPublicConfig } from '@/lib/api';
import {
  acceptTurnstileToken,
  consumeTurnstileVerification,
  getTurnstileToken,
  isTurnstileActionAllowed,
  isTurnstileVerificationSuccessful,
  resetTurnstileVerification,
  type TurnstileVerificationState,
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
}

interface LoginFormProps extends CommonFormProps {
  login: (identity: string, password: string, turnstileToken?: string) => Promise<void>;
}

interface RegisterFormProps extends CommonFormProps {
  register: (input: Parameters<typeof authApi.register>[0]) => Promise<void>;
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

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-4 border-l-2 border-[var(--t-hazard)] pl-3 font-sans text-[12px] leading-6 tracking-normal text-[var(--t-hazard)]">
      ERR // {message}
    </p>
  );
}

function TurnstileVerificationStatus() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex items-center justify-center gap-1.5 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-accent)]">
      <BadgeCheck aria-hidden="true" className="h-4 w-4" />
      <span>{t('auth.turnstilePassed')}</span>
    </div>
  );
}

function AgreementField({ checked, onCheckedChange, onOpen }: { checked: boolean; onCheckedChange: (checked: boolean) => void; onOpen: () => void }) {
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

function TurnstilePanel({
  mode,
  email,
  siteKey,
  revision,
  verified,
  onSuccess,
  onReset,
}: {
  mode: 'login' | 'register' | 'forgot';
  email: string;
  siteKey: string;
  revision: number;
  verified: boolean;
  onSuccess: (token: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 border border-[var(--t-noise)] bg-black p-2">
      <Turnstile
        key={`${mode}-${email}-${revision}`}
        siteKey={siteKey}
        onSuccess={onSuccess}
        onExpire={onReset}
        onError={onReset}
        options={{
          action:
            mode === 'login'
              ? 'login'
              : mode === 'register'
                ? 'register-email'
                : 'reset-password-email',
          theme: 'dark',
        }}
      />
      {verified ? <TurnstileVerificationStatus /> : null}
    </div>
  );
}

export function LoginForm({ config, login, onOpenAgreement }: LoginFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [turnstileVerification, setTurnstileVerification] = useState<TurnstileVerificationState>(resetTurnstileVerification);
  const [turnstileRevision, setTurnstileRevision] = useState(0);
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
      try {
        await login(value.identity, value.password, getTurnstileToken(turnstileVerification));
        toast.success(t('auth.loginSuccess'));
      } catch (error) {
        setTurnstileVerification(resetTurnstileVerification());
        setTurnstileRevision((current) => current + 1);
        setErrorMessage(error instanceof ApiError ? error.message : t('auth.operationFailed'));
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
          {(field) => <field.InputField label={t('auth.identity')} code="F.01" autoComplete="username" className="h-11" />}
        </form.AppField>
        <form.AppField name="password">
          {(field) => <field.InputField label={t('auth.password')} code="F.02" type="password" autoComplete="current-password" placeholder={t('auth.passwordPlaceholder')} className="h-11" />}
        </form.AppField>
        {config.turnstileEnabled ? (
          <TurnstilePanel
            mode="login"
            email=""
            siteKey={config.turnstileSiteKey}
            revision={turnstileRevision}
            verified={isTurnstileActionAllowed(turnstileVerification)}
            onSuccess={(token) => setTurnstileVerification(acceptTurnstileToken(token))}
            onReset={() => setTurnstileVerification(resetTurnstileVerification())}
          />
        ) : null}
        <form.AppField name="agreementAccepted">
          {(field) => <AgreementField checked={field.state.value} onCheckedChange={field.handleChange} onOpen={onOpenAgreement} />}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.agreementAccepted}>
          {(agreementAccepted) => (
            <form.SubmitButton
              className="w-full"
              disabled={!agreementAccepted || (config.turnstileEnabled && !isTurnstileActionAllowed(turnstileVerification))}
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
  requiresTurnstile,
  onSend,
  onPrepareResend,
}: {
  formField: ReactNode;
  code: string;
  sending: boolean;
  sent: boolean;
  requiresTurnstile: boolean;
  onSend: () => void;
  onPrepareResend: () => void;
}) {
  const { t } = useTranslation();
  const initialSendBlocked = !sent && requiresTurnstile;
  return (
    <div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">{formField}</div>
        <TButton
          type="button"
          variant="secondary"
          className="mb-0.5"
          disabled={sending || initialSendBlocked}
          title={initialSendBlocked ? t('auth.turnstileRequired') : undefined}
          onClick={() => {
            if (sent && requiresTurnstile) {
              onPrepareResend();
              return;
            }
            onSend();
          }}
        >
          {sending ? t('auth.sendingCode') : sent ? t('auth.resendCode') : t('auth.sendCode')}
        </TButton>
      </div>
      {initialSendBlocked ? <span className="mt-1 block text-[11px] text-[var(--t-signal)]">{t('auth.turnstileRequired')}</span> : null}
      <span className="sr-only">{code}</span>
    </div>
  );
}

export function RegisterForm({ config, register, onOpenAgreement }: RegisterFormProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [challengeId, setChallengeId] = useState('');
  const [turnstileVerification, setTurnstileVerification] = useState<TurnstileVerificationState>(resetTurnstileVerification);
  const [turnstileRevision, setTurnstileRevision] = useState(0);
  const [resendPreparing, setResendPreparing] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
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
        username: z.string().trim().min(USERNAME_MIN_LENGTH, t('auth.validation.usernameLength')).max(USERNAME_MAX_LENGTH, t('auth.validation.usernameLength')).regex(/^[A-Za-z0-9_]+$/u, t('auth.validation.usernamePattern')),
        email: z.email(t('auth.validation.email')).max(EMAIL_MAX_LENGTH, t('auth.validation.email')),
        verificationCode: z.string().regex(/^\d{6}$/u, t('auth.validation.verificationCode')),
        password: passwordSchema(t),
        agentName: z.string().trim().min(AGENT_NAME_MIN_LENGTH, t('auth.validation.agentNameLength')).max(AGENT_NAME_MAX_LENGTH, t('auth.validation.agentNameLength')),
        agentDescription: z.string().max(AGENT_DESCRIPTION_MAX_LENGTH, t('auth.validation.descriptionLength')),
        invitationCode: config.inviteRequired
          ? z.string().trim().min(1, t('auth.validation.invitationRequired')).max(INVITATION_CODE_MAX_LENGTH, t('auth.validation.invitationLength'))
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
          email: value.email,
          password: value.password,
          agentName: value.agentName,
          agentDescription: value.agentDescription || undefined,
          verificationChallengeId: challengeId,
          verificationCode: value.verificationCode,
          invitationCode: value.invitationCode || undefined,
        });
        toast.success(t('auth.registerSuccess'));
      } catch (error) {
        setErrorMessage(error instanceof ApiError ? error.message : t('auth.operationFailed'));
      }
    },
  });

  const resetChallenge = () => {
    setChallengeId('');
    setTurnstileVerification(resetTurnstileVerification());
    setResendPreparing(false);
    form.setFieldValue('verificationCode', '');
  };

  const sendCode = async () => {
    const email = form.state.values.email.trim();
    if (!email) return;
    if (config.turnstileEnabled && !isTurnstileActionAllowed(turnstileVerification)) {
      setErrorMessage(t('auth.turnstileRequired'));
      return;
    }
    setSendingCode(true);
    try {
      const result = await authApi.sendEmailVerification({ email, purpose: 'REGISTER', turnstileToken: getTurnstileToken(turnstileVerification) });
      setChallengeId(result.challengeId);
      setTurnstileVerification(consumeTurnstileVerification());
      setTurnstileRevision((current) => current + 1);
      setResendPreparing(false);
      setErrorMessage('');
      toast.success(t('auth.codeSent'));
    } catch (error) {
      if (config.turnstileEnabled) {
        setTurnstileVerification(resetTurnstileVerification());
        setTurnstileRevision((current) => current + 1);
      }
      setErrorMessage(error instanceof ApiError ? error.message : t('auth.operationFailed'));
    } finally {
      setSendingCode(false);
    }
  };

  const showTurnstile = config.turnstileEnabled && (!challengeId || resendPreparing);
  return (
    <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit(); }}>
      <form.AppForm>
        <ErrorLine message={errorMessage} />
        <form.AppField name="username">{(field) => <field.InputField label={t('auth.username')} code="R.01" autoComplete="username" placeholder={t('auth.usernamePlaceholder')} className="h-11" />}</form.AppField>
        <form.AppField name="email">{(field) => <field.InputField label={t('auth.email')} code="R.02" type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} className="h-11" onValueChange={resetChallenge} />}</form.AppField>
        <form.AppField name="verificationCode">
          {(field) => <VerificationCodeField code="R.03" sending={sendingCode} sent={Boolean(challengeId)} requiresTurnstile={config.turnstileEnabled && !isTurnstileActionAllowed(turnstileVerification)} onSend={() => void sendCode()} onPrepareResend={() => { setResendPreparing(true); setTurnstileVerification(resetTurnstileVerification()); setTurnstileRevision((current) => current + 1); }} formField={<field.OtpField label={t('auth.verificationCode')} code="R.03" />} />}
        </form.AppField>
        <form.AppField name="password">{(field) => <field.InputField label={t('auth.password')} code="R.04" type="password" autoComplete="new-password" placeholder={t('auth.passwordPlaceholder')} className="h-11" />}</form.AppField>
        <form.AppField name="agentName">{(field) => <field.InputField label={t('auth.agentName')} code="R.05" placeholder={t('auth.agentNamePlaceholder')} className="h-11" />}</form.AppField>
        <form.AppField name="agentDescription">{(field) => <field.InputField label={t('auth.agentDescription')} code="R.06" placeholder={t('auth.agentDescriptionPlaceholder')} className="h-11" />}</form.AppField>
        {config.inviteRequired ? <form.AppField name="invitationCode">{(field) => <field.InputField label={t('auth.invitationCode')} code="R.07" className="h-11" />}</form.AppField> : null}
        {showTurnstile ? <form.Subscribe selector={(state) => state.values.email}>{(email) => <TurnstilePanel mode="register" email={email} siteKey={config.turnstileSiteKey} revision={turnstileRevision} verified={isTurnstileActionAllowed(turnstileVerification)} onSuccess={(token) => setTurnstileVerification(acceptTurnstileToken(token))} onReset={() => setTurnstileVerification(resetTurnstileVerification())} />}</form.Subscribe> : null}
        {config.turnstileEnabled && challengeId && !resendPreparing && isTurnstileVerificationSuccessful(turnstileVerification) ? <TurnstileVerificationStatus /> : null}
        <form.AppField name="agreementAccepted">{(field) => <AgreementField checked={field.state.value} onCheckedChange={field.handleChange} onOpen={onOpenAgreement} />}</form.AppField>
        <form.Subscribe selector={(state) => [state.values.agreementAccepted, state.values.verificationCode, state.values.invitationCode] as const}>
          {([agreementAccepted, verificationCode, invitationCode]) => <form.SubmitButton className="w-full" disabled={!agreementAccepted || !challengeId || verificationCode.length !== VERIFICATION_CODE_LENGTH || (config.inviteRequired && !invitationCode.trim())} submittingContent={t('auth.submitting')}><UserPlus className="h-3.5 w-3.5" />{t('auth.registerSubmit')}</form.SubmitButton>}
        </form.Subscribe>
      </form.AppForm>
    </form>
  );
}

export function ForgotPasswordForm({ config, onComplete }: { config: AuthPublicConfig; onComplete: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [challengeId, setChallengeId] = useState('');
  const [turnstileVerification, setTurnstileVerification] = useState<TurnstileVerificationState>(resetTurnstileVerification);
  const [turnstileRevision, setTurnstileRevision] = useState(0);
  const [resendPreparing, setResendPreparing] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const form = useAppForm({
    defaultValues: { email: '', verificationCode: '', newPassword: '' },
    validators: {
      onSubmit: z.object({
        email: z.email(t('auth.validation.email')).max(EMAIL_MAX_LENGTH, t('auth.validation.email')),
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
        await authApi.resetPassword({ email: value.email, verificationChallengeId: challengeId, verificationCode: value.verificationCode, newPassword: value.newPassword });
        toast.success(t('auth.passwordResetSuccess'));
        onComplete();
      } catch (error) {
        setErrorMessage(error instanceof ApiError ? error.message : t('auth.operationFailed'));
      }
    },
  });

  const resetChallenge = () => {
    setChallengeId('');
    setTurnstileVerification(resetTurnstileVerification());
    setResendPreparing(false);
    form.setFieldValue('verificationCode', '');
  };
  const sendCode = async () => {
    const email = form.state.values.email.trim();
    if (!email) return;
    if (config.turnstileEnabled && !isTurnstileActionAllowed(turnstileVerification)) {
      setErrorMessage(t('auth.turnstileRequired'));
      return;
    }
    setSendingCode(true);
    try {
      const result = await authApi.sendEmailVerification({ email, purpose: 'RESET_PASSWORD', turnstileToken: getTurnstileToken(turnstileVerification) });
      setChallengeId(result.challengeId);
      setTurnstileVerification(consumeTurnstileVerification());
      setTurnstileRevision((current) => current + 1);
      setResendPreparing(false);
      setErrorMessage('');
      toast.success(t('auth.codeSent'));
    } catch (error) {
      if (config.turnstileEnabled) {
        setTurnstileVerification(resetTurnstileVerification());
        setTurnstileRevision((current) => current + 1);
      }
      setErrorMessage(error instanceof ApiError ? error.message : t('auth.operationFailed'));
    } finally {
      setSendingCode(false);
    }
  };
  const showTurnstile = config.turnstileEnabled && (!challengeId || resendPreparing);

  return (
    <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit(); }}>
      <form.AppForm>
        <ErrorLine message={errorMessage} />
        <form.AppField name="email">{(field) => <field.InputField label={t('auth.email')} code="K.01" type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} className="h-11" onValueChange={resetChallenge} />}</form.AppField>
        <form.AppField name="verificationCode">{(field) => <VerificationCodeField code="K.02" sending={sendingCode} sent={Boolean(challengeId)} requiresTurnstile={config.turnstileEnabled && !isTurnstileActionAllowed(turnstileVerification)} onSend={() => void sendCode()} onPrepareResend={() => { setResendPreparing(true); setTurnstileVerification(resetTurnstileVerification()); setTurnstileRevision((current) => current + 1); }} formField={<field.OtpField label={t('auth.verificationCode')} code="K.02" />} />}</form.AppField>
        <form.AppField name="newPassword">{(field) => <field.InputField label={t('auth.newPassword')} code="K.03" type="password" autoComplete="new-password" placeholder={t('auth.passwordPlaceholder')} className="h-11" />}</form.AppField>
        {showTurnstile ? <form.Subscribe selector={(state) => state.values.email}>{(email) => <TurnstilePanel mode="forgot" email={email} siteKey={config.turnstileSiteKey} revision={turnstileRevision} verified={isTurnstileActionAllowed(turnstileVerification)} onSuccess={(token) => setTurnstileVerification(acceptTurnstileToken(token))} onReset={() => setTurnstileVerification(resetTurnstileVerification())} />}</form.Subscribe> : null}
        {config.turnstileEnabled && challengeId && !resendPreparing && isTurnstileVerificationSuccessful(turnstileVerification) ? <TurnstileVerificationStatus /> : null}
        <form.Subscribe selector={(state) => state.values.verificationCode}>{(verificationCode) => <form.SubmitButton className="w-full" disabled={!challengeId || verificationCode.length !== VERIFICATION_CODE_LENGTH} submittingContent={t('auth.submitting')}><KeyRound className="h-3.5 w-3.5" />{t('auth.resetPassword')}</form.SubmitButton>}</form.Subscribe>
      </form.AppForm>
    </form>
  );
}
