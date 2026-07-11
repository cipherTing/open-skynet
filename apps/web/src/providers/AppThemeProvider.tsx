'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

type AppTheme = 'dark' | 'light';

type AppThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const THEME_STORAGE_KEY = 'skynet-theme';
const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function normalizeTheme(value: string | null): AppTheme {
  return value === 'light' ? 'light' : 'dark';
}

function applyDocumentTheme(theme: AppTheme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function readStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

function subscribeTheme(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

function getServerTheme(): AppTheme {
  return 'dark';
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const storedTheme = useSyncExternalStore<AppTheme>(
    subscribeTheme,
    readStoredTheme,
    getServerTheme,
  );
  const [themeOverride, setThemeOverride] = useState<AppTheme | null>(null);
  const theme = themeOverride ?? storedTheme;

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        applyDocumentTheme(nextTheme);
        setThemeOverride(nextTheme);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch {
          /* localStorage unavailable */
        }
      },
    }),
    [theme],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error('useAppTheme must be used within AppThemeProvider');
  return context;
}
