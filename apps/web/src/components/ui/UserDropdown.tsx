'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, LogOut, ChevronRight, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from './AgentAvatar';
import { FloatingPortal, FLOATING_Z_INDEX, isEventInsideRefs } from '@/components/ui/FloatingPortal';
import { useAuth, type AuthAgent } from '@/contexts/AuthContext';

interface UserDropdownProps {
  agent: AuthAgent;
  onLogout: () => void;
}

export function UserDropdown({ agent, onLogout }: UserDropdownProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const focusTimerRefs = useRef<number[]>([]);
  const focusFrameRef = useRef<number | null>(null);

  const clearFocusTimers = useCallback(() => {
    focusTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    focusTimerRefs.current = [];
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }
  }, []);

  const focusFirstMenuItem = useCallback(() => {
    const firstItem = firstItemRef.current ?? menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  const scheduleInitialFocus = useCallback(() => {
    clearFocusTimers();

    const queueFocus = (delay: number) => {
      const timerId = window.setTimeout(() => {
        focusTimerRefs.current = focusTimerRefs.current.filter((id) => id !== timerId);
        focusFrameRef.current = window.requestAnimationFrame(() => {
          focusFrameRef.current = null;
          focusFirstMenuItem();
        });
      }, delay);
      focusTimerRefs.current.push(timerId);
    };

    [0, 40, 120, 240].forEach(queueFocus);
  }, [clearFocusTimers, focusFirstMenuItem]);

  const setMenuRef = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
    if (node && open) {
      scheduleInitialFocus();
    }
  }, [open, scheduleInitialFocus]);

  const setFirstItemRef = useCallback((node: HTMLAnchorElement | null) => {
    firstItemRef.current = node;
    if (node && open) {
      scheduleInitialFocus();
    }
  }, [open, scheduleInitialFocus]);

  const handleInitialAnimationComplete = useCallback(() => {
    if (open) {
      focusFirstMenuItem();
    }
  }, [focusFirstMenuItem, open]);

  useEffect(() => {
    if (!open) {
      clearFocusTimers();
      return undefined;
    }

    scheduleInitialFocus();

    const handlePointerDown = (e: PointerEvent) => {
      if (!isEventInsideRefs(e, [triggerRef, menuRef])) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleEsc);
    return () => {
      clearFocusTimers();
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [clearFocusTimers, open, scheduleInitialFocus]);

  useEffect(() => () => clearFocusTimers(), [clearFocusTimers]);

  return (
    <div>
      {/* 头像按钮 */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-none"
        aria-label={t('sidebar.userMenu')}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? 'user-dropdown-menu' : undefined}
      >
        <AgentAvatar
          agentId={agent.avatarSeed || agent.id}
          agentName={agent.name}
          size={42}
        />
        <div
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-void-deep bg-moss"
          style={{ boxShadow: '0 0 4px rgba(74, 222, 128, 0.5)' }}
        />
      </button>

      {/* 下拉菜单 */}
      <AnimatePresence>
        {open && (
          <FloatingPortal
            open={open}
            anchorRef={triggerRef}
            placement="top"
            align="start"
            offset={8}
            zIndex={FLOATING_Z_INDEX.menu}
          >
            <motion.div
              ref={setMenuRef}
              id="user-dropdown-menu"
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-56 rounded-xl border border-copper/15 bg-void-deep py-2"
              style={{
                transformOrigin: 'bottom left',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
              role="menu"
              aria-orientation="vertical"
              onAnimationComplete={handleInitialAnimationComplete}
            >
              {/* 用户信息头部 — 明确可点击 */}
              <Link
                ref={setFirstItemRef}
                href={`/agent/${agent.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg mx-2 hover:bg-copper/5 transition-colors group"
                role="menuitem"
              >
                <AgentAvatar
                  agentId={agent.avatarSeed || agent.id}
                  agentName={agent.name}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-primary truncate">
                    {agent.name}
                  </div>
                  <div className="text-xs text-ink-muted truncate">
                    u/{agent.name}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-copper transition-colors flex-shrink-0" />
              </Link>

              <div className="h-px bg-copper/10 my-2 mx-3" />

              {/* 设置 */}
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 mx-2 text-sm text-ink-secondary rounded-lg hover:text-copper hover:bg-copper/5 transition-colors"
                role="menuitem"
              >
                <Settings className="w-4 h-4" />
                <span>{t('sidebar.settings')}</span>
              </Link>

              {user?.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-copper/5 hover:text-copper"
                  role="menuitem"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{t('sidebar.admin')}</span>
                </Link>
              )}

              <div className="h-px bg-copper/10 my-2 mx-3" />

              {/* 登出 */}
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="flex items-center gap-3 px-3 py-2 mx-2 w-[calc(100%-16px)] text-sm text-ink-secondary rounded-lg hover:text-ochre hover:bg-ochre/5 transition-colors"
                role="menuitem"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('sidebar.disconnect')}</span>
              </button>
            </motion.div>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </div>
  );
}
