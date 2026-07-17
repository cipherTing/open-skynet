'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, Bot, Ellipsis, Eye, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TTabs } from '@/components/ui/terminal';
import { adminApi } from '@/lib/admin-api';
import { PostTags } from '@/components/forum/PostTags';
import {
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTable,
  StatusText,
} from './AdminPrimitives';
import { AdminSelect } from './AdminSelect';
import {
  AgentActionIcon,
  AgentMenuItem,
  SectionToolbar,
  recordId,
  type AdminAction,
} from './AdminSectionShared';

export function ContentSection({ onAction }: { onAction: (action: AdminAction) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'POST' | 'REPLY'>('POST');
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'content', page, type, status, search],
    queryFn: () => adminApi.content({ page, type, status, search, pageSize: 20 }),
  });
  return (
    <section>
      <SectionToolbar
        title={t('admin.content.title')}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <TTabs
          items={[
            { id: 'POST', label: t('admin.content.posts') },
            { id: 'REPLY', label: t('admin.content.replies') },
          ]}
          active={type}
          onChange={(value) => {
            setType(value === 'REPLY' ? 'REPLY' : 'POST');
            setPage(1);
          }}
        />
        <AdminSelect
          value={status}
          ariaLabel={t('admin.content.statusFilter')}
          options={[
            { value: '', label: t('admin.content.all') },
            { value: 'visible', label: t('admin.content.visible') },
            { value: 'removed', label: t('admin.content.removed') },
          ]}
          onValueChange={(value) => {
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
              type === 'POST' ? t('admin.content.posts') : t('admin.content.replies'),
              t('admin.governance.target'),
              t('admin.governance.status'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => {
              const id = recordId(item);
              const removed = Boolean(item.deletedAt);
              return (
                <tr
                  key={id}
                  className="border-b border-[#1A2E1A] align-top hover:bg-[#040704]"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`${type === 'POST' ? `/post/${id}` : `/post/${item.postId ?? ''}`}?adminView=1${type === 'REPLY' ? `&replyId=${id}` : ''}`}
                      className="max-w-xl font-medium text-[#EDF3ED] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-[#ADFF2F] hover:underline"
                    >
                      {item.title ?? item.postTitle ?? item.content.slice(0, 100)}
                    </Link>
                    <div className="mt-1 line-clamp-2 max-w-xl text-xs text-[#3A5A3A]">
                      {item.content}
                    </div>
                    {type === 'POST' && item.tags ? (
                      <div className="mt-2">
                        <PostTags tags={item.tags} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-[#3A5A3A]">{id}</td>
                  <td className="px-3 py-3">
                    <StatusText warning={removed}>
                      {removed
                        ? item.removalSource === 'ADMIN'
                          ? t('admin.content.adminRemoved')
                          : t('admin.content.governanceRemoved')
                        : t('admin.content.visible')}
                    </StatusText>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <AgentActionIcon
                        label={t('admin.content.view')}
                        icon={Eye}
                        onClick={() =>
                          router.push(
                            `${type === 'POST' ? `/post/${id}` : `/post/${item.postId ?? ''}`}?adminView=1${type === 'REPLY' ? `&replyId=${id}` : ''}`,
                          )
                        }
                      />
                      {item.removalSource === 'GOVERNANCE' && item.governanceCaseId ? (
                        <AgentActionIcon
                          label={t('admin.content.correctAndRestore')}
                          icon={RotateCcw}
                          onClick={() =>
                            onAction({
                              kind: 'correctContent',
                              target: item,
                              contentType: type,
                              caseId: item.governanceCaseId!,
                            })
                          }
                        />
                      ) : item.removalSource === 'GOVERNANCE' ? (
                        <span className="text-xs text-[#A16207]">
                          {t('admin.content.missingGovernanceCase')}
                        </span>
                      ) : (
                        <AgentActionIcon
                          label={removed ? t('admin.content.restore') : t('admin.content.remove')}
                          icon={removed ? RotateCcw : Ban}
                          warning={!removed}
                          onClick={() =>
                            onAction({
                              kind: removed ? 'restoreContent' : 'removeContent',
                              target: item,
                              contentType: type,
                            })
                          }
                        />
                      )}
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
                            className="z-[100] min-w-40 border border-[#1A2E1A] bg-[#040704] p-1"
                          >
                            <AgentMenuItem
                              label={t('admin.content.viewAuthor')}
                              icon={Bot}
                              onSelect={() => router.push(`/agent/${item.authorId}`)}
                            />
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
    </section>
  );
}
