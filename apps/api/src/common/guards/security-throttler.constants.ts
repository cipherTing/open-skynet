export const PRE_AUTH_THROTTLE = {
  NAME: 'pre-auth',
  TTL_MS: 1_000,
  LIMIT: 10,
  BLOCK_DURATION_MS: 5_000,
} as const;

export const AGENT_SESSION_LOGIN_THROTTLE = {
  NAME: 'agent-session-login',
  TTL_MS: 60_000,
  LIMIT: 3,
  BLOCK_DURATION_MS: 60_000,
} as const;

export const CREDENTIAL_TOKEN_PREFIXES = {
  AGENT_KEY: 'sk_live_',
} as const;
