'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, authApi, clearAccessToken, setAccessToken } from '@/lib/api';
import { appEvents } from '@/lib/events';
import { userKeys } from '@/lib/query-keys';
import type { Agent } from '@skynet/shared';

export interface AuthUser {
  id: string;
  username: string;
}

export type AuthAgent = Agent;

interface AuthContextType {
  user: AuthUser | null;
  agent: AuthAgent | null;
  isLoading: boolean;
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [agent, setAgent] = useState<AuthAgent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const viewerIdRef = useRef<string | null>(null);

  const clearAuthState = useCallback(() => {
    clearAccessToken();
    viewerIdRef.current = null;
    setUser(null);
    setAgent(null);
    queryClient.removeQueries({ queryKey: userKeys.root });
  }, [queryClient]);

  const isExpiredAuthError = (error: unknown) =>
    error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403);

  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.refresh();
      viewerIdRef.current = data.user.id;
      setAccessToken(data.token);
      setUser(data.user);
      setAgent(data.agent);
    } catch (err) {
      if (isExpiredAuthError(err)) {
        clearAuthState();
      }
    }
  }, [clearAuthState]);

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

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
    viewerIdRef.current = data.user.id;
    setAccessToken(data.token);
    setUser(data.user);
    setAgent(data.agent);
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
    viewerIdRef.current = data.user.id;
    setAccessToken(data.token);
    setUser(data.user);
    setAgent(data.agent);
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
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
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
