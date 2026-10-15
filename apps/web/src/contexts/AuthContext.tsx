'use client';
import { createContext, useContext, useEffect, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, authApi, clearAccessToken, setAccessToken } from '@/lib/api';
import { appEvents } from '@/lib/events';
import { authKeys } from '@/lib/query-keys';
import {
  getAuthSessionState,
  type AuthAgent,
  type AuthSession,
  type AuthUser,
} from '@/lib/auth-session';

export type { AuthAgent, AuthSession, AuthUser } from '@/lib/auth-session';

type AuthSessionState = {
  session: AuthSession | null;
  status: 'loading' | 'ready' | 'error';
};

interface AuthContextType {
  user: AuthUser | null;
  agent: AuthAgent | null;
  sessionType: AuthSession['sessionType'] | null;
  isLoading: boolean;
  isUnavailable: boolean;
  isAuthenticated: boolean;
  isAgentSession: boolean;
  viewerKey: string;
  login: (identity: string, password: string, turnstileToken?: string) => Promise<void>;
  loginAgent: (key: string) => Promise<void>;
  register: (data: Parameters<typeof authApi.register>[0]) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retrySession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const isExpiredAuthError = (error: unknown) =>
  error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);

async function loadAuthSession(): Promise<AuthSession | null> {
  try {
    const data = await authApi.refreshSession();
    setAccessToken(data.token);
    return data;
  } catch (err) {
    if (isExpiredAuthError(err)) {
      clearAccessToken();
      return null;
    }
    throw err;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authSessionKey = authKeys.session();
  const authSessionQuery = useQuery({
    queryKey: authSessionKey,
    queryFn: loadAuthSession,
    enabled: typeof window !== 'undefined',
    retry: false,
  });
  const authSessionState: AuthSessionState = authSessionQuery.isError
    ? { session: null, status: 'error' }
    : authSessionQuery.isPending
      ? { session: null, status: 'loading' }
      : { session: authSessionQuery.data ?? null, status: 'ready' };
  const authSession = authSessionState.session;
  const authSessionView = getAuthSessionState(authSession);
  const { user, agent } = authSessionView;

  const clearAuthState = useCallback(() => {
    clearAccessToken();
    queryClient.clear();
  }, [queryClient]);

  const resetBrowserSession = useCallback(() => {
    clearAuthState();
    window.location.replace('/workspace');
  }, [clearAuthState]);

  const retrySession = useCallback(async () => {
    await authSessionQuery.refetch();
  }, [authSessionQuery]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.refreshSession();
      setAccessToken(data.token);
      queryClient.setQueryData<AuthSession | null>(authSessionKey, data);
    } catch (err) {
      if (isExpiredAuthError(err)) {
        resetBrowserSession();
        return;
      }
      throw err;
    }
  }, [authSessionKey, queryClient, resetBrowserSession]);

  useEffect(() => {
    const handleAuthExpired = () => {
      const currentSession = queryClient.getQueryData<AuthSession | null>(authSessionKey);
      if (currentSession) {
        resetBrowserSession();
        return;
      }
      clearAccessToken();
    };
    const handleRefreshRequired = () => {
      void queryClient.invalidateQueries({ queryKey: authSessionKey, exact: true });
    };
    const handleSessionRefreshed = (session: AuthSession) => {
      queryClient.setQueryData<AuthSession | null>(authSessionKey, session);
    };

    appEvents.on('auth:expired', handleAuthExpired);
    appEvents.on('auth:refresh-required', handleRefreshRequired);
    appEvents.on('auth:session-refreshed', handleSessionRefreshed);
    return () => {
      appEvents.off('auth:expired', handleAuthExpired);
      appEvents.off('auth:refresh-required', handleRefreshRequired);
      appEvents.off('auth:session-refreshed', handleSessionRefreshed);
    };
  }, [authSessionKey, clearAuthState, queryClient, resetBrowserSession]);

  const login = async (identity: string, password: string, turnstileToken?: string) => {
    const data = await authApi.login({ identity, password, turnstileToken });
    setAccessToken(data.token);
    queryClient.clear();
    const session: Extract<AuthSession, { sessionType: 'USER' }> = {
      sessionType: 'USER',
      user: data.user,
      agent: data.agent,
      token: data.token,
    };
    queryClient.setQueryData<AuthSession | null>(authSessionKey, session);
  };

  const loginAgent = async (key: string) => {
    const data = await authApi.loginAgent(key);
    setAccessToken(data.token);
    queryClient.clear();
    queryClient.setQueryData<AuthSession | null>(authSessionKey, data);
  };

  const register = async (input: Parameters<typeof authApi.register>[0]) => {
    const data = await authApi.register(input);
    setAccessToken(data.token);
    queryClient.clear();
    const session: Extract<AuthSession, { sessionType: 'USER' }> = {
      sessionType: 'USER',
      user: data.user,
      agent: data.agent,
      token: data.token,
    };
    queryClient.setQueryData<AuthSession | null>(authSessionKey, session);
  };

  const logout = async () => {
    if (authSession?.sessionType === 'AGENT') {
      await authApi.logoutAgent();
    } else {
      await authApi.logout();
    }
    resetBrowserSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        agent,
        sessionType: authSessionView.sessionType,
        isLoading: authSessionState.status === 'loading',
        isUnavailable: authSessionState.status === 'error',
        isAuthenticated: authSessionView.isAuthenticated,
        isAgentSession: authSessionView.isAgentSession,
        viewerKey: authSessionView.viewerKey,
        login,
        loginAgent,
        register,
        logout,
        refreshUser,
        retrySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
