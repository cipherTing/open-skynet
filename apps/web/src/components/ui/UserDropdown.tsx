'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from './AgentAvatar';
import { FLOATING_Z_INDEX } from '@/components/ui/FloatingPortal';
import { useAuth, type AuthAgent } from '@/contexts/AuthContext';

export function UserDropdown({ agent, onLogout }: { agent: AuthAgent; onLogout: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdministrator = user?.role === 'ADMIN';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="relative flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black" aria-label={t('sidebar.userMenu')}>
          <AgentAvatar agentId={agent.avatarSeed || agent.id} agentName={agent.name} size={42} />
          {isAdministrator && <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center border border-black bg-[var(--t-accent)] text-black"><ShieldCheck className="h-2.5 w-2.5 stroke-[3]" /></span>}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 border border-black bg-[var(--t-accent)]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="right" align="end" sideOffset={10} style={{ zIndex: FLOATING_Z_INDEX.menu }} className="skynet-floating-content w-56 rounded-none border border-[var(--t-noise)] bg-[var(--t-panel)] p-1.5 outline-none">
          <DropdownMenu.Item asChild>
            <Link href={`/agent/${agent.id}`} className="flex cursor-pointer items-center gap-3 px-2 py-2 outline-none transition-colors [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)]/10 focus:bg-[var(--t-accent)]/10"><AgentAvatar agentId={agent.avatarSeed || agent.id} agentName={agent.name} size={32} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-white">{agent.name}</div>{isAdministrator && <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--t-accent)]">{t('sidebar.adminStatus')}</div>}</div><ChevronRight className="h-4 w-4 text-[var(--t-faint)]" /></Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--t-noise)]" />
          <DropdownMenu.Item asChild><Link href="/settings" className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white/70 outline-none transition-colors [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)]/10 hover:text-[var(--t-accent)] focus:bg-[var(--t-accent)]/10 focus:text-[var(--t-accent)]"><Settings className="h-4 w-4" />{t('sidebar.settings')}</Link></DropdownMenu.Item>
          {isAdministrator && <DropdownMenu.Item asChild><Link href="/admin" className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white/70 outline-none transition-colors [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)]/10 hover:text-[var(--t-accent)] focus:bg-[var(--t-accent)]/10 focus:text-[var(--t-accent)]"><ShieldCheck className="h-4 w-4" />{t('sidebar.admin')}</Link></DropdownMenu.Item>}
          <DropdownMenu.Item onSelect={onLogout} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-[var(--t-hazard)]/80 outline-none transition-colors [transition-timing-function:steps(2,end)] hover:bg-[var(--t-hazard-dim)]/40 hover:text-[var(--t-hazard)] focus:bg-[var(--t-hazard-dim)]/40 focus:text-[var(--t-hazard)]"><LogOut className="h-4 w-4" />{t('sidebar.disconnect')}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
