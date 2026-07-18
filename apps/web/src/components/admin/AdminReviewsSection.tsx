'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TTabs } from '@/components/ui/terminal';
import { useToast } from '@/components/ui/SignalToast';
import { adminApi } from '@/lib/admin-api';
import {
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminSectionTitle,
  AdminTable,
  StatusText,
} from './AdminPrimitives';
import { AdminSelect } from './AdminSelect';
import { AgentActionIcon, DecisionDialog } from './AdminSectionShared';
import { AdminReviewDetailDialog } from './AdminReviewDetailDialog';

export function ReviewsSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    id: string;
    value: 'APPROVE' | 'REJECT';
  } | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'reviews', page, type, status],
    queryFn: () => adminApi.reviews({ page, pageSize: 20, type, status }),
  });
  const mutation = useMutation({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!decision) throw new Error('Review decision is missing');
      return adminApi.decideReview(decision.id, {
        decision: decision.value,
        ...(reason ? { reason } : {}),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      toast.success(t('admin.reviews.success'));
      setDecision(null);
    },
  });
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <AdminSectionTitle>{t('admin.reviews.title')}</AdminSectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          <TTabs
            items={['PENDING', 'APPROVED', 'REJECTED'].map((value) => ({
              id: value,
              label: t(`admin.reviews.statuses.${value}`),
            }))}
            active={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <AdminSelect
            value={type}
            ariaLabel={t('admin.reviews.type')}
            options={[
              { value: '', label: t('admin.reviews.allTypes') },
              { value: 'POST', label: t('admin.reviews.types.POST') },
              { value: 'CIRCLE', label: t('admin.reviews.types.CIRCLE') },
            ]}
            onValueChange={(value) => {
              setType(value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {query.isPending ? (
        <AdminLoading />
      ) : query.isError ? (
        <AdminError retry={() => void query.refetch()} />
      ) : (
        <>
          <AdminTable
            headers={[
              t('admin.reviews.submission'),
              t('admin.reviews.requester'),
              t('admin.reviews.status'),
              t('admin.agents.actions'),
            ]}
          >
            {query.data.items.map((item) => {
              const title =
                item.type === 'POST' && 'title' in item.payload
                  ? item.payload.title
                  : item.type === 'CIRCLE' && 'name' in item.payload
                    ? item.payload.name
                    : '-';
              const excerpt =
                item.type === 'POST' && 'content' in item.payload
                  ? item.payload.content
                  : item.type === 'CIRCLE' && 'topic' in item.payload
                    ? item.payload.topic
                    : '';
              return (
                <tr key={item.id} className="border-b border-[var(--t-noise)] align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-[var(--t-text)]">{title}</div>
                    <div className="mt-1 line-clamp-2 max-w-xl text-xs text-[var(--t-sub)]">
                      {excerpt}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--t-sub)]">
                      {t(`admin.reviews.types.${item.type}`)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-white/60">{item.requester.name}</td>
                  <td className="px-3 py-3">
                    <StatusText warning={item.status === 'REJECTED'}>
                      {t(`admin.reviews.statuses.${item.status}`)}
                    </StatusText>
                    {item.decisionReason ? (
                      <p className="mt-1 max-w-xs text-xs text-[var(--t-sub)]">{item.decisionReason}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <AgentActionIcon
                        label={t('admin.reviews.viewDetail')}
                        icon={Eye}
                        onClick={() => setSelectedReviewId(item.id)}
                      />
                      {item.status === 'PENDING' ? (
                        <>
                          <AgentActionIcon
                            label={t('admin.reviews.approve')}
                            icon={Check}
                            onClick={() => setDecision({ id: item.id, value: 'APPROVE' })}
                          />
                          <AgentActionIcon
                            label={t('admin.reviews.reject')}
                            icon={X}
                            warning
                            onClick={() => setDecision({ id: item.id, value: 'REJECT' })}
                          />
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </AdminTable>
          <AdminPagination meta={query.data.meta} onPageChange={setPage} />
        </>
      )}
      <DecisionDialog
        key={decision ? `${decision.id}-${decision.value}` : 'review-decision'}
        open={Boolean(decision)}
        title={
          decision
            ? t(
                decision.value === 'APPROVE'
                  ? 'admin.reviews.approveTitle'
                  : 'admin.reviews.rejectTitle',
              )
            : ''
        }
        description={decision ? t('admin.reviews.confirmDescription') : ''}
        requireReason={decision?.value === 'REJECT'}
        loading={mutation.isPending}
        error={mutation.error}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDecision(null);
        }}
        onConfirm={(reason) => mutation.mutate({ reason })}
      />
      <AdminReviewDetailDialog
        reviewId={selectedReviewId}
        onClose={() => setSelectedReviewId(null)}
        onDecision={(value) => {
          if (!selectedReviewId) return;
          setDecision({ id: selectedReviewId, value });
          setSelectedReviewId(null);
        }}
      />
    </section>
  );
}
