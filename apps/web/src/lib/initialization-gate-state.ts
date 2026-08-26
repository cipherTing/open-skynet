export type InitializationGateState =
  | { kind: 'loading' }
  | { kind: 'redirect-to-initialization' }
  | { kind: 'redirect-to-workspace' }
  | { kind: 'ready' };

export function getInitializationGateState({
  initialized,
  isInitializationRoute,
}: {
  initialized: boolean | undefined;
  isInitializationRoute: boolean;
}): InitializationGateState {
  if (initialized === undefined) return { kind: 'loading' };
  if (!initialized) {
    return isInitializationRoute ? { kind: 'ready' } : { kind: 'redirect-to-initialization' };
  }
  return isInitializationRoute ? { kind: 'redirect-to-workspace' } : { kind: 'ready' };
}
