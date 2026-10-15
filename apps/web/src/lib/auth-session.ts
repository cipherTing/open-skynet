import type { Agent, UserRole } from '@skynet/shared';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

export type AuthAgent = Agent;

export type AuthSession =
  | {
      sessionType: 'USER';
      user: AuthUser;
      agent: AuthAgent | null;
      token: string;
    }
  | {
      sessionType: 'AGENT';
      user: null;
      agent: AuthAgent;
      token: string;
    };

export interface AuthSessionView {
  user: AuthUser | null;
  agent: AuthAgent | null;
  sessionType: AuthSession['sessionType'] | null;
  isAuthenticated: boolean;
  isAgentSession: boolean;
  viewerKey: string;
}

export function getAuthSessionState(session: AuthSession | null): AuthSessionView {
  if (!session) {
    return {
      user: null,
      agent: null,
      sessionType: null,
      isAuthenticated: false,
      isAgentSession: false,
      viewerKey: 'anonymous',
    };
  }

  return {
    user: session.user,
    agent: session.agent,
    sessionType: session.sessionType,
    isAuthenticated: true,
    isAgentSession: session.sessionType === 'AGENT',
    viewerKey:
      session.sessionType === 'AGENT'
        ? ['agent', session.agent.id].join(':')
        : ['user', session.user.id].join(':'),
  };
}

export function shouldShowAgentLoginEntry(
  isLoading: boolean,
  isAuthenticated: boolean,
): boolean {
  return !isLoading && !isAuthenticated;
}
