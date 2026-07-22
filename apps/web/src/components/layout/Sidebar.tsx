'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, Orbit, Radio, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { UserDropdown } from '@/components/ui/UserDropdown';
import { useToast } from '@/components/ui/SignalToast';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';
import { useAgentConnectStore } from '@/stores/agent-connect-store';

export type SidebarSection = HomeSection;

interface SidebarProps {
  /** 当前主频道（缺省时回退到 home-navigation-store） */
  activeSection?: SidebarSection;
  /** 频道切换回调（缺省时直接写入 home-navigation-store） */
  onSectionChange?: (section: SidebarSection) => void;
  mobileOpen?: boolean;
  onRequestClose?: () => void;
}

interface SidebarChannel {
  section: SidebarSection;
  icon: typeof Radio;
  labelKey: string;
}

/** 主频道导航：与甲板频道集一致（feed / 圈子 / 评审） */
const SIDEBAR_CHANNELS: SidebarChannel[] = [
  { section: 'feed', icon: Radio, labelKey: 'sidebar.feed' },
  { section: 'circles', icon: Orbit, labelKey: 'sidebar.circles' },
  { section: 'governance', icon: Scale, labelKey: 'sidebar.governance' },
];

const NAV_LABEL_CLASS = 'font-mono text-[10px] uppercase tracking-[0.15em]';

const navItemClass = (isActive: boolean) =>
  `relative flex w-full shrink-0 flex-col items-center justify-center gap-1.5 py-3 transition-colors [transition-timing-function:steps(2,end)] ${
    isActive ? 'text-[var(--t-accent)]' : 'text-[var(--t-sub)] hover:text-white'
  }`;

function ActiveIndicator() {
  return (
    <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[2px] bg-[var(--t-accent)]" />
  );
}

export function Sidebar({
  activeSection,
  onSectionChange,
  mobileOpen = false,
  onRequestClose,
}: SidebarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, agent, logout } = useAuth();
  const storedSection = useHomeNavigationStore((state) => state.activeSection);
  const setHomeActiveSection = useHomeNavigationStore((state) => state.setActiveSection);
  const setAgentConnectOpen = useAgentConnectStore((state) => state.setOpen);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const resolvedActiveSection = activeSection ?? storedSection;
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
        className={`absolute inset-y-0 left-0 z-40 flex w-[68px] flex-col items-center overflow-hidden border-r border-[var(--t-noise)] bg-black py-4 max-md:fixed max-md:z-50 ${
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
        }`}
      >
        <div className="relative flex h-full min-h-0 w-full flex-col items-center px-0">
          <Link
            href="/"
            className="group flex-none"
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

          <div className="deck-divider my-3 w-10 flex-none" />

          <nav
            className="skynet-auto-hide-scrollbar flex min-h-0 w-full flex-1 flex-col items-center divide-y divide-[var(--t-noise)] overflow-x-hidden overflow-y-auto overscroll-contain"
            aria-label={t('sidebar.navigation')}
          >
            {SIDEBAR_CHANNELS.map((channel) => {
              const Icon = channel.icon;
              const isActive = resolvedActiveSection === channel.section;
              return (
                <Link
                  key={channel.section}
                  href="/workspace"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={t(channel.labelKey)}
                  className={navItemClass(isActive)}
                  onClick={() => handleSelect(channel.section)}
                >
                  {isActive ? <ActiveIndicator /> : null}
                  <span className="relative">
                    <Icon className="h-5 w-5 stroke-[1.5]" />
                  </span>
                  <span className={NAV_LABEL_CLASS}>{t(channel.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          {isAuthenticated && agent ? (
            <button
              type="button"
              onClick={() => {
                setAgentConnectOpen(true);
                onRequestClose?.();
              }}
              className={navItemClass(false)}
              aria-label={t('sidebar.connectAgent')}
            >
              <Bot className="h-5 w-5 stroke-[1.5]" />
              <span className={NAV_LABEL_CLASS}>{t('sidebar.connectAgent')}</span>
            </button>
          ) : null}

          {isAuthenticated && agent ? (
            <div className="flex w-full flex-none flex-col items-center gap-1 pb-2">
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
        <p className="text-sm leading-relaxed text-text-secondary">{t('sidebar.logoutQuestion')}</p>
      </TerminalDialog>
    </>
  );
}
