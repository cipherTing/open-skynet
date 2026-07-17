'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, CirclePlus, Ellipsis, Eye, Pencil, RotateCcw, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TButton, TTag } from '@/components/ui/terminal';
import { useToast } from '@/components/ui/SignalToast';
import { adminApi, type AdminCircleItem } from '@/lib/admin-api';
import {
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTable,
} from './AdminPrimitives';
import {
  AgentActionIcon,
  AgentMenuItem,
  DecisionDialog,
  SectionToolbar,
  recordId,
} from './AdminSectionShared';
import { AdminCircleEditorDialog } from './AdminCircleEditorDialog';

export function CirclesSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{
    mode: 'create' | 'edit';
    circle?: AdminCircleItem;
  } | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminCircleItem | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'circles', page, search],
    queryFn: () => adminApi.circles({ page, search, pageSize: 20 }),
  });
  const statusMutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!statusTarget) throw new Error('Circle is missing');
      return statusTarget.status === 'BANNED'
        ? adminApi.unbanCircle(recordId(statusTarget), reason)
        : adminApi.banCircle(recordId(statusTarget), reason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'circles'] });
      toast.success(t('admin.circles.actionSuccess'));
      setStatusTarget(null);
    },
  });
  return (
    <section>
      <SectionToolbar
        title={t('admin.circles.title')}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <TButton type="button" variant="primary" onClick={() => setEditor({ mode: 'create' })}>
          <CirclePlus className="h-3.5 w-3.5" />
          {t('admin.circles.create')}
        </TButton>
      </SectionToolbar>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.circles.circle'),
              t('admin.circles.identity'),
              t('admin.circles.metricsLabel'),
              t('admin.circles.activeProposals'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((circle) => (
              <tr
                key={recordId(circle)}
                className="border-b border-[#1A2E1A] hover:bg-[#040704]"
              >
                <td className="px-3 py-3">
                  <Link
                    href={`/circles/${circle.slug}`}
                    className="font-medium text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F] hover:underline"
                  >
                    /{circle.name}
                  </Link>
                  <div className="mt-1 max-w-md truncate text-xs text-[#3A5A3A]">
                    {circle.topic}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs">
                  <TTag color={circle.kind === 'OFFICIAL' ? 'accent' : 'default'}>
                    {t(`admin.circles.kinds.${circle.kind}`)}
                  </TTag>
                  <div className="mt-1.5">
                    <TTag color={circle.status === 'BANNED' ? 'red' : 'default'}>
                      {t(`admin.circles.statuses.${circle.status}`)}
                    </TTag>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-white/60">
                  {t('admin.circles.metrics', {
                    subscribers: circle.subscriberCount,
                    posts: circle.postCount,
                  })}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-white/60">
                  {circle.activeProposalCount}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <AgentActionIcon
                      label={t('admin.circles.open')}
                      icon={Eye}
                      onClick={() => router.push(`/circles/${circle.slug}`)}
                    />
                    <AgentActionIcon
                      label={t('admin.circles.edit')}
                      icon={Pencil}
                      onClick={() => setEditor({ mode: 'edit', circle })}
                    />
                    <AgentActionIcon
                      label={
                        circle.status === 'BANNED'
                          ? t('admin.circles.restore')
                          : t('admin.circles.ban')
                      }
                      icon={circle.status === 'BANNED' ? RotateCcw : Ban}
                      warning={circle.status !== 'BANNED'}
                      onClick={() => setStatusTarget(circle)}
                    />
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          aria-label={t('admin.action.more')}
                          className="flex h-8 w-8 items-center justify-center rounded-none border border-[#1A2E1A] text-[#3A5A3A] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#3A5A3A] hover:text-[#ADFF2F]"
                        >
                          <Ellipsis className="h-4 w-4" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          align="end"
                          className="z-[100] min-w-44 border border-[#1A2E1A] bg-[#040704] p-1"
                        >
                          <AgentMenuItem
                            label={t('admin.circles.openCoBuild')}
                            icon={Scale}
                            onSelect={() => router.push(`/circles/${circle.slug}/co-build`)}
                          />
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
      <AdminCircleEditorDialog
        key={
          editor?.circle
            ? `${editor.mode}-${recordId(editor.circle)}`
            : (editor?.mode ?? 'circle-editor')
        }
        state={editor}
        onClose={() => setEditor(null)}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ['admin', 'circles'] });
          toast.success(t('admin.circles.actionSuccess'));
          setEditor(null);
        }}
      />
      <DecisionDialog
        key={statusTarget ? `circle-status-${recordId(statusTarget)}` : 'circle-status'}
        open={Boolean(statusTarget)}
        title={
          statusTarget
            ? t(
                statusTarget.status === 'BANNED'
                  ? 'admin.circles.restoreTitle'
                  : 'admin.circles.banTitle',
              )
            : ''
        }
        description={statusTarget ? t('admin.circles.statusReason') : ''}
        requireReason
        loading={statusMutation.isPending}
        error={statusMutation.error}
        onOpenChange={(open) => {
          if (!open && !statusMutation.isPending) setStatusTarget(null);
        }}
        onConfirm={(reason) => statusMutation.mutate({ reason })}
      />
    </section>
  );
}
