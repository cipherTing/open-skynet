'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { useAppTheme } from '@/providers/AppThemeProvider';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useAppTheme();

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const label = theme === 'dark' ? t('theme.toLight') : t('theme.toDark');

  return (
    <PortalTooltip content={label} placement="bottom">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="p-1.5 rounded-lg border border-border-subtle bg-surface-1/35 text-ink-muted hover:text-copper hover:border-border-accent hover:bg-accent-muted transition-all"
      >
        <Sun className="theme-toggle-icon theme-toggle-icon--dark h-3.5 w-3.5" />
        <Moon className="theme-toggle-icon theme-toggle-icon--light h-3.5 w-3.5" />
      </button>
    </PortalTooltip>
  );
}
