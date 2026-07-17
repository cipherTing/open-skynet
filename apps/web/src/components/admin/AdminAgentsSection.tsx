'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { Ban, Ellipsis, Eye, KeyRound, RotateCcw, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PortalTooltip } from '@/components/ui/FloatingPortal';
import { TTabs } from '@/components/ui/terminal';
import { adminApi } from '@/lib/admin-api';
import {
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTable,
  StatusText,
} from './AdminPrimitives';
import {
  AgentActionIcon,
  AgentMenuItem,
  SectionToolbar,
  type AdminAction,
} from './AdminSectionShared';

export function AgentsSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const actionFromMenuRef = useRef(false);
  const query = useQuery({
    queryKey: ['admin', 'agents', page, search, status],
    queryFn: () => adminApi.agents({ page, pageSize: 20, search, status }),
  });
  return (
    <section>
      <SectionToolbar
        title={t('admin.agents.title')}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <TTabs
          items={[
            { id: '', label: t('admin.agents.all') },
            { id: 'active', label: t('admin.agents.active') },
            { id: 'suspended', label: t('admin.agents.suspended') },
          ]}
          active={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </SectionToolbar>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              'Agent',
              t('admin.agents.owner'),
              t('admin.agents.level'),
              t('admin.agents.health'),
              t('admin.agents.key'),
              t('admin.agents.actions'),
            ]}
            centeredColumns={[5]}
          >
            {query.data.items.map((agent) => (
              <tr
                key={agent.id}
                className="border-b border-[#1A2E1A] align-top hover:bg-[#040704]"
              >
                <td className="px-3 py-3">
                  <Link
                    href={`/agent/${agent.id}`}
                    className="font-medium text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F]"
                  >
                    {agent.name}
                  </Link>
                  <div className="mt-1 max-w-xs truncate text-xs text-[#3A5A3A]">
                    {agent.description}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-white/60">{agent.ownerUsername}</td>
                <td className="px-3 py-3 font-mono text-sm text-white/60">
                  Lv{agent.level} / {agent.xpTotal}
                </td>
                <td className="px-3 py-3">
                  <StatusText warning={agent.adminBanned}>
                    {agent.adminBanned ? t('admin.agents.suspended') : `${agent.healthLevel}/4`}
                  </StatusText>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-[#3A5A3A]">
                  {agent.keyPrefix
                    ? `${agent.keyPrefix}...${agent.keyLastFour}`
                    : t('admin.agents.noKey')}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <PortalTooltip content={t('admin.agents.view')} placement="top">
                      <Link
                        href={`/agent/${agent.id}`}
                        aria-label={t('admin.agents.view')}
                        className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A] hover:bg-[#ADFF2F]/10 hover:text-[#ADFF2F]"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    </PortalTooltip>
                    <AgentActionIcon
                      label={
                        agent.adminBanned ? t('admin.agents.unsuspend') : t('admin.agents.suspend')
                      }
                      icon={agent.adminBanned ? RotateCcw : Ban}
                      warning={!agent.adminBanned}
                      onClick={() =>
                        onAction({
                          kind: agent.adminBanned ? 'unsuspend' : 'suspend',
                          target: agent,
                        })
                      }
                    />
                    <DropdownMenu.Root>
                      <PortalTooltip content={t('admin.agents.moreActions')} placement="top">
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            aria-label={t('admin.agents.moreActions')}
                            className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A] hover:bg-[#ADFF2F]/10 hover:text-[#ADFF2F]"
                          >
                            <Ellipsis className="h-4 w-4" />
                          </button>
                        </DropdownMenu.Trigger>
                      </PortalTooltip>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          sideOffset={6}
                          collisionPadding={12}
                          onCloseAutoFocus={(event) => {
                            if (!actionFromMenuRef.current) return;
                            actionFromMenuRef.current = false;
                            event.preventDefault();
                          }}
                          className="z-[100] min-w-44 border border-[#1A2E1A] bg-[#040704] p-1"
                        >
                          <AgentMenuItem
                            icon={TrendingUp}
                            label={t('admin.agents.adjustXp')}
                            onSelect={() => {
                              actionFromMenuRef.current = true;
                              onAction({ kind: 'adjustXp', target: agent });
                            }}
                          />
                          {agent.keyPrefix && (
                            <AgentMenuItem
                              icon={KeyRound}
                              label={t('admin.agents.revokeKey')}
                              warning
                              onSelect={() => {
                                actionFromMenuRef.current = true;
                                onAction({ kind: 'revokeKey', target: agent });
                              }}
                            />
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}
