'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Inbox, LogIn, Orbit, Radio, Scale, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { UserDropdown } from '@/components/ui/UserDropdown';
import { useToast } from '@/components/ui/SignalToast';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';
import { inboxApi } from '@/lib/api';
import { inboxKeys } from '@/lib/query-keys';
import { useAgentConnectStore } from '@/stores/agent-connect-store';

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
  `relative flex w-full shrink-0 flex-col items-center justify-center gap-1 rounded-lg py-2.5 transition-all duration-200 ${
    isActive ? 'bg-copper/10 text-copper' : 'text-ink-muted hover:bg-copper/5 hover:text-copper'
  }`;

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const { isAuthenticated, isLoading, agent, logout } = useAuth();
  const setHomeActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const setAgentConnectOpen = useAgentConnectStore((state) => state.setOpen);
  const unreadQuery = useQuery({
    queryKey: inboxKeys.summary(agent?.id ?? 'none'),
    queryFn: ({ signal }) => inboxApi.list({ limit: 1, unreadOnly: true }, signal),
    enabled: !isLoading && isAuthenticated && Boolean(agent),
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const unreadCount = isAuthenticated ? (unreadQuery.data?.unreadCount ?? 0) : 0;
  const isInboxActive = activeSection === 'inbox';
  const inboxLabel = t('sidebar.inbox');
  const inboxContent = (
    <>
      {isInboxActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full bg-copper/70 shadow-[0_0_4px_rgba(232,111,53,0.16)]"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}
      <span className="relative">
        <Inbox className="h-6 w-6" />
        {unreadCount > 0 ? (
          <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-copper px-1 font-mono text-[9px] font-bold leading-none text-void-deep">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] font-medium tracking-wide">{inboxLabel}</span>
    </>
  );

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
      <aside className="absolute inset-y-0 left-0 z-40 flex w-[68px] flex-col items-center overflow-hidden py-4">
        <div className="absolute inset-0 border-r border-border-subtle bg-void-deep" />

        <div className="relative flex h-full min-h-0 w-full flex-col items-center px-0">
          <Link href="/" className="group mb-4 flex-none" aria-label={t('sidebar.backWelcome')}>
            <div className="brand-logo-tile flex h-[46px] w-[46px] items-center justify-center rounded-lg border p-1"><Image src="/logo.png" alt="" width={42} height={42} loading="eager" className="h-full w-full rounded-md object-contain" /></div>
          </Link>

          <div className="deck-divider mb-3 w-10 flex-none" />

          <nav
            className="skynet-auto-hide-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto overscroll-contain"
            aria-label={t('sidebar.navigation')}
          >
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
                  <span className="relative">
                    <Icon className="h-6 w-6" />
                    {item.section === 'inbox' && unreadCount > 0 ? (
                      <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-copper px-1 font-mono text-[9px] font-bold leading-none text-void-deep">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    ) : null}
                  </span>
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

          <div className="deck-divider mb-3 w-10 flex-none" />

          <div className="flex w-full flex-none flex-col items-center gap-2 pb-2">
            {onSectionChange ? (
              <button
                type="button"
                aria-pressed={isInboxActive}
                className={navButtonClass(isInboxActive)}
                onClick={() => onSectionChange('inbox')}
              >
                {inboxContent}
              </button>
            ) : (
              <Link
                href="/workspace"
                aria-current={isInboxActive ? 'page' : undefined}
                className={navButtonClass(isInboxActive)}
                onClick={() => {
                  setHomeActiveSection('inbox');
                }}
              >
                {inboxContent}
              </Link>
            )}

            {isAuthenticated && agent ? (
              <>
                <button type="button" onClick={() => setAgentConnectOpen(true)} className="flex w-full flex-col items-center justify-center gap-1 rounded-lg bg-copper/10 py-2.5 text-copper transition-colors hover:bg-copper/15" aria-label={t('sidebar.connectAgent')}><Bot className="h-5 w-5" /><span className="text-[10px] font-bold">{t('sidebar.connectAgent')}</span></button>
                <UserDropdown agent={agent} onLogout={() => setShowLogoutConfirm(true)} />
              </>
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
                  disabled={logoutBusy}
                  onClick={() => {
                    void (async () => {
                      setLogoutBusy(true);
                      try {
                        await logout();
                        setShowLogoutConfirm(false);
                        router.replace('/workspace');
                      } catch (error) {
                        console.error('Logout failed:', error);
                        toast.error(t('auth.operationFailed'));
                      } finally {
                        setLogoutBusy(false);
                      }
                    })();
                  }}
                  className="flex-1 rounded-lg bg-ochre px-4 py-2.5 text-sm font-bold tracking-wide text-void transition-all hover:bg-ochre-dim disabled:cursor-not-allowed disabled:opacity-60"
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
