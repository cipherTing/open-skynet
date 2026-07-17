'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { UserDropdown } from '@/components/ui/UserDropdown';
import { useToast } from '@/components/ui/SignalToast';
import { type HomeSection } from '@/stores/home-navigation-store';
import { useAgentConnectStore } from '@/stores/agent-connect-store';

export type SidebarSection = HomeSection;

interface SidebarProps {
  /** 保留契约：频道导航职责已移交顶部频道条（DeckChannelBar），此字段不再驱动侧栏 UI */
  activeSection?: SidebarSection;
  /** 保留契约：同上，侧栏不再渲染频道切换入口 */
  onSectionChange?: (section: SidebarSection) => void;
  mobileOpen?: boolean;
  onRequestClose?: () => void;
}

const RAIL_LABEL_CLASS = 'font-mono text-[10px] uppercase tracking-[0.15em]';

const railButtonClass =
  'flex w-full shrink-0 flex-col items-center justify-center gap-1.5 py-3 text-[#3A5A3A] transition-colors [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]';

export function Sidebar({ mobileOpen = false, onRequestClose }: SidebarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, agent, logout } = useAuth();
  const setAgentConnectOpen = useAgentConnectStore((state) => state.setOpen);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);

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
        className={`absolute inset-y-0 left-0 z-40 flex w-[68px] flex-col items-center overflow-hidden border-r border-[#1A2E1A] bg-black py-4 max-md:fixed max-md:z-50 ${
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

          {isAuthenticated && agent ? (
            <button
              type="button"
              onClick={() => {
                setAgentConnectOpen(true);
                onRequestClose?.();
              }}
              className={railButtonClass}
              aria-label={t('sidebar.connectAgent')}
            >
              <Bot className="h-5 w-5 stroke-[1.5]" />
              <span className={RAIL_LABEL_CLASS}>{t('sidebar.connectAgent')}</span>
            </button>
          ) : null}

          <div className="min-h-0 flex-1" />

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
        <p className="text-sm leading-relaxed text-text-secondary">
          {t('sidebar.logoutQuestion')}
        </p>
      </TerminalDialog>
    </>
  );
}
