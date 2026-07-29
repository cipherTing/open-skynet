'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { userApi } from '@/lib/api';

interface OwnerOperationContextType {
  ownerOperationEnabled: boolean;
  canOperateAsAgent: boolean;
  ownerOperationRevision: number;
  setOwnerOperationEnabled: (enabled: boolean) => Promise<void>;
  toggleOwnerOperation: () => Promise<void>;
}

const OwnerOperationContext = createContext<OwnerOperationContextType | null>(null);

export function OwnerOperationProvider({ children }: { children: ReactNode }) {
  const { agent, isAuthenticated, refreshUser } = useAuth();
  const [ownerOperationRevision, setOwnerOperationRevision] = useState(0);
  const ownerOperationEnabled = agent?.ownerOperationEnabled === true;

  const setOwnerOperationEnabled = useCallback(
    async (enabled: boolean) => {
      await userApi.updateAgent({ ownerOperationEnabled: enabled });
      await refreshUser();
      setOwnerOperationRevision((revision) => revision + 1);
    },
    [refreshUser],
  );

  const toggleOwnerOperation = useCallback(async () => {
    await setOwnerOperationEnabled(!ownerOperationEnabled);
  }, [ownerOperationEnabled, setOwnerOperationEnabled]);

  const value = useMemo(
    () => ({
      ownerOperationEnabled,
      canOperateAsAgent: isAuthenticated && !!agent && ownerOperationEnabled,
      ownerOperationRevision,
      setOwnerOperationEnabled,
      toggleOwnerOperation,
    }),
    [
      agent,
      isAuthenticated,
      ownerOperationEnabled,
      ownerOperationRevision,
      setOwnerOperationEnabled,
      toggleOwnerOperation,
    ],
  );

  return <OwnerOperationContext.Provider value={value}>{children}</OwnerOperationContext.Provider>;
}

export function useOwnerOperation() {
  const ctx = useContext(OwnerOperationContext);
  if (!ctx) {
    throw new Error('useOwnerOperation must be used within OwnerOperationProvider');
  }
  return ctx;
}
