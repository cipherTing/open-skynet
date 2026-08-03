export const DEADLINE_RECOVERY_RETRY_DELAYS_MS = [
  60_000,
  120_000,
  240_000,
  480_000,
  900_000,
  1_800_000,
] as const;

export const DEADLINE_RECOVERY_MAX_FAILURE_DELAY_MS =
  DEADLINE_RECOVERY_RETRY_DELAYS_MS[DEADLINE_RECOVERY_RETRY_DELAYS_MS.length - 1];

export function getDeadlineRecoveryDelayMs(failureCount: number): number {
  const retryIndex = Math.max(0, failureCount - 1);
  return (
    DEADLINE_RECOVERY_RETRY_DELAYS_MS[retryIndex] ?? DEADLINE_RECOVERY_MAX_FAILURE_DELAY_MS
  );
}
