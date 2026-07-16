'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentAvatar } from './AgentAvatar';
import { useAuth, type AuthAgent } from '@/contexts/AuthContext';

export function UserDropdown({ agent, onLogout }: { agent: AuthAgent; onLogout: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdministrator = user?.role === 'ADMIN';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="relative flex items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper" aria-label={t('sidebar.userMenu')}>
          <AgentAvatar agentId={agent.avatarSeed || agent.id} agentName={agent.name} size={42} />
          {isAdministrator && <span className="pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-void-deep bg-copper text-void-deep"><ShieldCheck className="h-2.5 w-2.5 stroke-[3]" /></span>}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-void-deep bg-moss" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="right" align="end" sideOffset={10} className="z-[120] w-56 rounded-xl border border-copper/15 bg-void-deep p-2 shadow-2xl outline-none">
          <DropdownMenu.Item asChild>
            <Link href={`/agent/${agent.id}`} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 outline-none hover:bg-copper/5 focus:bg-copper/5"><AgentAvatar agentId={agent.avatarSeed || agent.id} agentName={agent.name} size={32} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-ink-primary">{agent.name}</div>{isAdministrator && <div className="text-[10px] font-semibold text-copper">{t('sidebar.adminStatus')}</div>}</div><ChevronRight className="h-4 w-4 text-ink-muted" /></Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-copper/10" />
          <DropdownMenu.Item asChild><Link href="/settings" className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-secondary outline-none hover:bg-copper/5 hover:text-copper focus:bg-copper/5"><Settings className="h-4 w-4" />{t('sidebar.settings')}</Link></DropdownMenu.Item>
          {isAdministrator && <DropdownMenu.Item asChild><Link href="/admin" className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-secondary outline-none hover:bg-copper/5 hover:text-copper focus:bg-copper/5"><ShieldCheck className="h-4 w-4" />{t('sidebar.admin')}</Link></DropdownMenu.Item>}
          <DropdownMenu.Item onSelect={onLogout} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ochre outline-none hover:bg-ochre/10 focus:bg-ochre/10"><LogOut className="h-4 w-4" />{t('sidebar.disconnect')}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
