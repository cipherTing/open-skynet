'use client';
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, authApi, clearAccessToken, setAccessToken } from '@/lib/api';
import { appEvents } from '@/lib/events';
import { authKeys, userKeys } from '@/lib/query-keys';
import type { Agent } from '@skynet/shared';

export interface AuthUser {
  id: string;
  username: string;
}

export type AuthAgent = Agent;

type AuthSession = {
  user: AuthUser;
  agent: AuthAgent | null;
  token: string;
};

type AuthSessionState = {
  session: AuthSession | null;
  status: 'loading' | 'ready' | 'error';
};

interface AuthContextType {
  user: AuthUser | null;
  agent: AuthAgent | null;
  isLoading: boolean;
  isUnavailable: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    agentName: string,
    agentDescription?: string,
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  retrySession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const isExpiredAuthError = (error: unknown) =>
  error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);

async function loadAuthSession(): Promise<AuthSession | null> {
  try {
    const data = await authApi.refresh();
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
    retry: false,
  });
  const authSessionState: AuthSessionState = authSessionQuery.isError
    ? { session: null, status: 'error' }
    : authSessionQuery.isPending
      ? { session: null, status: 'loading' }
      : { session: authSessionQuery.data ?? null, status: 'ready' };
  const authSession = authSessionState.session;
  const user = authSession?.user ?? null;
  const agent = authSession?.agent ?? null;

  const clearAuthState = useCallback(() => {
    clearAccessToken();
    queryClient.setQueryData<AuthSession | null>(authSessionKey, null);
    queryClient.removeQueries({ queryKey: userKeys.root });
  }, [authSessionKey, queryClient]);

  const retrySession = useCallback(async () => {
    await authSessionQuery.refetch();
  }, [authSessionQuery]);

  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.refresh();
      setAccessToken(data.token);
      queryClient.setQueryData<AuthSession | null>(authSessionKey, data);
    } catch (err) {
      if (isExpiredAuthError(err)) {
        clearAuthState();
        return;
      }
      throw err;
    }
  }, [authSessionKey, clearAuthState, queryClient]);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuthState();
    };

    appEvents.on('auth:expired', handleAuthExpired);
    return () => {
      appEvents.off('auth:expired', handleAuthExpired);
    };
  }, [clearAuthState]);

  const login = async (username: string, password: string) => {
    const data = await authApi.login({ username, password });
    setAccessToken(data.token);
    queryClient.setQueryData<AuthSession | null>(authSessionKey, data);
  };

  const register = async (
    username: string,
    password: string,
    agentName: string,
    agentDescription?: string,
  ) => {
    const data = await authApi.register({
      username,
      password,
      agentName,
      agentDescription,
    });
    setAccessToken(data.token);
    queryClient.setQueryData<AuthSession | null>(authSessionKey, data);
  };

  const logout = async () => {
    await authApi.logout();
    clearAuthState();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        agent,
        isLoading: authSessionState.status === 'loading',
        isUnavailable: authSessionState.status === 'error',
        isAuthenticated: !!user,
        login,
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
