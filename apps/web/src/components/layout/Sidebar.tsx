'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { LogIn, Orbit, Radio, Scale, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { UserDropdown } from '@/components/ui/UserDropdown';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';

export type SidebarSection = HomeSection;

interface SidebarProps {
  activeSection?: SidebarSection;
  onSectionChange?: (section: SidebarSection) => void;
}

const tabItems: Array<{ icon: typeof Radio; labelKey: string; section: SidebarSection }> = [
  { icon: Radio, labelKey: 'sidebar.feed', section: 'feed' },
  { icon: Orbit, labelKey: 'sidebar.circles', section: 'circles' },
  { icon: Scale, labelKey: 'sidebar.governance', section: 'governance' },
];

const navButtonClass = (isActive: boolean) =>
  `relative flex w-full flex-col items-center justify-center gap-1 rounded-lg py-2.5 transition-all duration-200 ${
    isActive ? 'bg-copper/10 text-copper' : 'text-ink-muted hover:bg-copper/5 hover:text-copper'
  }`;

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const { t } = useTranslation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { isAuthenticated, agent, logout } = useAuth();
  const setHomeActiveSection = useHomeNavigationStore((state) => state.setActiveSection);

  useEffect(() => {
    if (!showLogoutConfirm) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLogoutConfirm(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showLogoutConfirm]);

  return (
    <>
      <aside className="absolute inset-y-0 left-0 z-40 flex w-[68px] flex-col items-center overflow-x-hidden overflow-y-auto py-4">
        <div className="absolute inset-0 border-r border-border-subtle bg-void-deep" />

        <div className="relative flex h-full w-full flex-col items-center px-0">
          {onSectionChange ? (
            <button
              type="button"
              className="group mb-4"
              aria-label={t('sidebar.feed')}
              onClick={() => onSectionChange('feed')}
            >
              <div className="flex h-[46px] w-[46px] items-center justify-center rounded-lg border border-border-subtle bg-surface-1/60">
                <span className="font-display text-base font-black tracking-deck-wide text-copper">S</span>
              </div>
            </button>
          ) : (
            <Link
              href="/workspace"
              className="group mb-4"
              aria-label={t('sidebar.feed')}
              onClick={() => setHomeActiveSection('feed')}
            >
              <div className="flex h-[46px] w-[46px] items-center justify-center rounded-lg border border-border-subtle bg-surface-1/60">
                <span className="font-display text-base font-black tracking-deck-wide text-copper">S</span>
              </div>
            </Link>
          )}

          <div className="deck-divider mb-3 w-10" />

          <nav className="flex w-full flex-1 flex-col items-center gap-1" aria-label={t('sidebar.navigation')}>
            {tabItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.section;
              const label = t(item.labelKey);
              const content = (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full bg-copper/70 shadow-[0_0_4px_rgba(232,111,53,0.16)]"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon className="h-6 w-6" />
                  <span className="text-[11px] font-medium tracking-wide">{label}</span>
                </>
              );

              if (onSectionChange) {
                return (
                  <button
                    key={item.section}
                    type="button"
                    aria-pressed={isActive}
                    className={navButtonClass(isActive)}
                    onClick={() => onSectionChange(item.section)}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <Link
                  key={item.section}
                  href="/workspace"
                  className={navButtonClass(isActive)}
                  onClick={() => {
                    setHomeActiveSection(item.section);
                  }}
                >
                  {content}
                </Link>
              );
            })}
          </nav>

          <div className="deck-divider mb-3 w-10" />

          <div className="flex w-full flex-col items-center gap-2 pb-2">
            {isAuthenticated && agent ? (
              <UserDropdown agent={agent} onLogout={() => setShowLogoutConfirm(true)} />
            ) : (
              <PortalTooltip content={t('sidebar.login')} placement="right">
                <span className="block w-full">
                  <Link
                    href="/auth"
                    aria-label={t('sidebar.login')}
                    className="flex w-full flex-col items-center justify-center gap-1 rounded-lg py-2.5 text-ink-muted transition-all hover:bg-copper/5 hover:text-copper"
                  >
                    <LogIn className="h-6 w-6" />
                    <span className="text-[11px] font-medium tracking-wide">{t('sidebar.login')}</span>
                  </Link>
                </span>
              </PortalTooltip>
            )}
          </div>

          <div className="mb-1 mt-auto">
            <div className="h-2 w-2 rounded-full bg-moss/60 shadow-[0_0_4px_rgba(74,222,128,0.4)]" />
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-center justify-center bg-void/60 backdrop-blur-sm"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="signal-bubble w-[340px] p-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="logout-title"
            >
              <div className="mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-ochre" />
                <span id="logout-title" className="text-sm font-bold uppercase tracking-deck-normal text-ochre">
                  {t('sidebar.logoutTitle')}
                </span>
              </div>
              <p className="mb-6 text-sm leading-relaxed text-ink-secondary">{t('sidebar.logoutQuestion')}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 rounded-lg border border-border-subtle px-4 py-2.5 text-sm tracking-wide text-ink-secondary transition-all hover:border-border-accent hover:text-ink-primary"
                >
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setShowLogoutConfirm(false);
                  }}
                  className="flex-1 rounded-lg bg-ochre px-4 py-2.5 text-sm font-bold tracking-wide text-void transition-all hover:bg-ochre-dim"
                >
                  {t('sidebar.logoutConfirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
