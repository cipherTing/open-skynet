import { z } from 'zod';

const EMAIL_MAX_LENGTH = 254;

export type TurnstileVerificationState =
  | { kind: 'unverified' }
  | { kind: 'verified'; token: string };

export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;
export const AUTHENTICATION_TURNSTILE_ACTION = 'authentication';

interface EmailVerificationSendEligibilityInput {
  email: string;
  turnstileEnabled: boolean;
  turnstileReady: boolean;
  cooldownUntil: number | null;
  now: number;
  sending: boolean;
}

export function normalizeAuthenticationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function acceptTurnstileToken(token: string): TurnstileVerificationState {
  return token ? { kind: 'verified', token } : resetTurnstileVerification();
}

export function consumeTurnstileVerification(): TurnstileVerificationState {
  return resetTurnstileVerification();
}

export function resetTurnstileVerification(): TurnstileVerificationState {
  return { kind: 'unverified' };
}

export function isTurnstileActionAllowed(state: TurnstileVerificationState): boolean {
  return state.kind === 'verified';
}

export function getTurnstileToken(state: TurnstileVerificationState): string | undefined {
  return state.kind === 'verified' ? state.token : undefined;
}

export function getEmailVerificationSendEligibility({
  email,
  turnstileEnabled,
  turnstileReady,
  cooldownUntil,
  now,
  sending,
}: EmailVerificationSendEligibilityInput): { canSend: boolean; cooldownSeconds: number } {
  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;
  const emailValid = z
    .string()
    .email()
    .max(EMAIL_MAX_LENGTH)
    .safeParse(normalizeAuthenticationEmail(email)).success;
  return {
    canSend:
      emailValid && !sending && cooldownSeconds === 0 && (!turnstileEnabled || turnstileReady),
    cooldownSeconds,
  };
}

export function createEmailVerificationCooldown(now: number): number {
  return now + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;
}
