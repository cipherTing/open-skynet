'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bot, Inbox, Orbit, Radio, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
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
  mobileOpen?: boolean;
  onRequestClose?: () => void;
}

type SidebarTabItem =
  | { icon: typeof Radio; labelKey: string; section: SidebarSection; href?: undefined }
  | { icon: typeof Radio; labelKey: string; href: string; section?: undefined };

const tabItems: SidebarTabItem[] = [
  { icon: Radio, labelKey: 'sidebar.feed', section: 'feed' },
  { icon: Orbit, labelKey: 'sidebar.circles', section: 'circles' },
  { icon: Scale, labelKey: 'sidebar.governance', section: 'governance' },
];

const NAV_LABEL_CLASS = 'font-mono text-[10px] uppercase tracking-[0.15em]';

const navButtonClass = (isActive: boolean) =>
  `relative flex w-full shrink-0 flex-col items-center justify-center gap-1.5 py-3 transition-colors [transition-timing-function:steps(2,end)] ${
    isActive ? 'text-[#ADFF2F]' : 'text-[#3A5A3A] hover:text-white'
  }`;

function ActiveIndicator() {
  return (
    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-[#ADFF2F]" />
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center bg-[#ADFF2F] px-1 font-mono text-[9px] font-bold leading-none text-black">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Sidebar({
  activeSection,
  onSectionChange,
  mobileOpen = false,
  onRequestClose,
}: SidebarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, isLoading, agent, logout } = useAuth();
  const setHomeActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const setAgentConnectOpen = useAgentConnectStore((state) => state.setOpen);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
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

  const handleSelect = (section: SidebarSection) => {
    if (onSectionChange) {
      onSectionChange(section);
    } else {
      setHomeActiveSection(section);
    }
    onRequestClose?.();
  };

  const handleLogoutConfirm = () => {
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
  };

  const inboxContent = (
    <>
      {isInboxActive && <ActiveIndicator />}
      <span className="relative">
        <Inbox className="h-5 w-5 stroke-[1.5]" />
        {unreadCount > 0 ? <UnreadBadge count={unreadCount} /> : null}
      </span>
      <span className={NAV_LABEL_CLASS}>{t('sidebar.inbox')}</span>
    </>
  );

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label={t('sidebar.closeNav')}
          onClick={onRequestClose}
          className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.72)] md:hidden"
        />
      ) : null}
      <aside
        className={`absolute inset-y-0 left-0 z-40 flex w-[68px] flex-col items-center overflow-hidden border-r border-[#1A2E1A] bg-black py-4 max-md:fixed max-md:z-50 ${
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
        }`}
      >
        <div className="relative flex h-full min-h-0 w-full flex-col items-center px-0">
          <Link
            href="/"
            className="group mb-4 flex-none"
            aria-label={t('sidebar.backWelcome')}
            onClick={onRequestClose}
          >
            <div className="brand-logo-tile flex h-[46px] w-[46px] items-center justify-center border p-1">
              <Image
                src="/logo.png"
                alt=""
                width={42}
                height={42}
                loading="eager"
                className="h-full w-full object-contain"
              />
            </div>
          </Link>

          <div className="deck-divider mb-3 w-10 flex-none" />

          <nav
            className="skynet-auto-hide-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto overscroll-contain"
            aria-label={t('sidebar.navigation')}
          >
            {tabItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href !== undefined
                ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                : activeSection === item.section;
              const content = (
                <>
                  {isActive && <ActiveIndicator />}
                  <Icon className="h-5 w-5 stroke-[1.5]" />
                  <span className={NAV_LABEL_CLASS}>{t(item.labelKey)}</span>
                </>
              );

              if (item.href !== undefined) {
                return (
                  <Link
                    key={item.labelKey}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={navButtonClass(isActive)}
                    onClick={onRequestClose}
                  >
                    {content}
                  </Link>
                );
              }

              const section = item.section;

              if (onSectionChange) {
                return (
                  <button
                    key={section}
                    type="button"
                    aria-pressed={isActive}
                    className={navButtonClass(isActive)}
                    onClick={() => handleSelect(section)}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <Link
                  key={section}
                  href="/workspace"
                  className={navButtonClass(isActive)}
                  onClick={() => handleSelect(section)}
                >
                  {content}
                </Link>
              );
            })}
          </nav>

          {isAuthenticated && agent ? (
            <div className="flex w-full flex-none flex-col items-center gap-1 pb-2">
              <div className="deck-divider my-2 w-10 flex-none" />
              {onSectionChange ? (
                <button
                  type="button"
                  aria-pressed={isInboxActive}
                  className={navButtonClass(isInboxActive)}
                  onClick={() => handleSelect('inbox')}
                >
                  {inboxContent}
                </button>
              ) : (
                <Link
                  href="/workspace"
                  aria-current={isInboxActive ? 'page' : undefined}
                  className={navButtonClass(isInboxActive)}
                  onClick={() => handleSelect('inbox')}
                >
                  {inboxContent}
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  setAgentConnectOpen(true);
                  onRequestClose?.();
                }}
                className={navButtonClass(false)}
                aria-label={t('sidebar.connectAgent')}
              >
                <Bot className="h-5 w-5 stroke-[1.5]" />
                <span className={NAV_LABEL_CLASS}>{t('sidebar.connectAgent')}</span>
              </button>
              <div className="deck-divider my-2 w-10 flex-none" />
              <UserDropdown agent={agent} onLogout={() => setShowLogoutConfirm(true)} />
            </div>
          ) : null}
        </div>
      </aside>

      <TerminalDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        title={t('sidebar.logoutTitle')}
        code="AUTH.LOGOUT"
        size="sm"
        variant="alert"
        footer={
          <>
            <button
              type="button"
              className="t-btn t-btn--ghost"
              onClick={() => setShowLogoutConfirm(false)}
            >
              {t('app.cancel')}
            </button>
            <button
              type="button"
              disabled={logoutBusy}
              className="t-btn t-btn--danger"
              onClick={handleLogoutConfirm}
            >
              {t('sidebar.logoutConfirm')}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          {t('sidebar.logoutQuestion')}
        </p>
      </TerminalDialog>
    </>
  );
}
