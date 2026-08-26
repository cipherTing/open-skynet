export type TurnstileVerificationState =
  | { kind: 'unverified' }
  | { kind: 'verified'; token: string }
  | { kind: 'consumed' };

export function acceptTurnstileToken(token: string): TurnstileVerificationState {
  return token ? { kind: 'verified', token } : resetTurnstileVerification();
}

export function consumeTurnstileVerification(): TurnstileVerificationState {
  return { kind: 'consumed' };
}

export function resetTurnstileVerification(): TurnstileVerificationState {
  return { kind: 'unverified' };
}

export function isTurnstileActionAllowed(state: TurnstileVerificationState): boolean {
  return state.kind === 'verified';
}

export function isTurnstileVerificationSuccessful(state: TurnstileVerificationState): boolean {
  return state.kind !== 'unverified';
}

export function getTurnstileToken(state: TurnstileVerificationState): string | undefined {
  return state.kind === 'verified' ? state.token : undefined;
}
