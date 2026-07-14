'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/lib/admin-api';
import { AdminError, AdminLoading, StatusText, formatAdminTime } from './AdminPrimitives';

export function AdminReviewDetailDialog({
  reviewId,
  onClose,
  onDecision,
}: {
  reviewId: string | null;
  onClose: () => void;
  onDecision: (decision: 'APPROVE' | 'REJECT') => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'reviews', 'detail', reviewId],
    queryFn: () => adminApi.reviewDetail(reviewId!),
    enabled: Boolean(reviewId),
  });
  const detail = query.data;
  return (
    <Dialog.Root open={Boolean(reviewId)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/45 backdrop-blur-[2px]" />
        <Dialog.Content className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border-default bg-void-deep p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-bold text-ink-primary">{t('admin.reviews.detailTitle')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">{t('admin.reviews.detailDescription')}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label={t('app.close')} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          {query.isPending ? (
            <div className="py-16"><AdminLoading /></div>
          ) : query.isError || !detail ? (
            <div className="py-10"><AdminError retry={() => void query.refetch()} /></div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border-subtle py-3 text-xs text-ink-secondary">
                <span>{t(`admin.reviews.types.${detail.type}`)}</span>
                <StatusText warning={detail.status === 'REJECTED'}>{t(`admin.reviews.statuses.${detail.status}`)}</StatusText>
                <span>{detail.requester.name}</span>
                <span>{formatAdminTime(detail.createdAt)}</span>
              </div>
              {detail.type === 'POST' && 'title' in detail.payload ? (
                <>
                  <section>
                    <div className="text-[10px] font-bold text-ink-muted">{t('admin.reviews.postTitle')}</div>
                    <h3 className="mt-1 text-lg font-bold text-ink-primary">{detail.payload.title}</h3>
                  </section>
                  <section>
                    <div className="text-[10px] font-bold text-ink-muted">{t('admin.reviews.postBody')}</div>
                    <div className="prose prose-sm mt-3 max-w-none text-ink-secondary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{detail.payload.content}</ReactMarkdown>
                    </div>
                  </section>
                  <section className="border-l-2 border-steel/35 pl-3">
                    <div className="text-[10px] font-bold text-steel">{t('admin.reviews.targetCircle')}</div>
                    <p className="mt-1 text-sm text-ink-secondary">{detail.circle?.name ?? t('admin.reviews.circleUnavailable')}</p>
                  </section>
                </>
              ) : detail.type === 'CIRCLE' && 'name' in detail.payload ? (
                <>
                  <section>
                    <div className="text-[10px] font-bold text-ink-muted">{t('admin.circles.name')}</div>
                    <h3 className="mt-1 text-lg font-bold text-ink-primary">{detail.payload.name}</h3>
                  </section>
                  <section>
                    <div className="text-[10px] font-bold text-ink-muted">{t('admin.circles.topic')}</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-secondary">{detail.payload.topic}</p>
                  </section>
                  <section className={`border-l-2 pl-3 ${detail.duplicateCircle ? 'border-ochre/45' : 'border-moss/45'}`}>
                    <div className="text-[10px] font-bold text-ink-muted">{t('admin.reviews.duplicateCheck')}</div>
                    <p className="mt-1 text-sm text-ink-secondary">
                      {detail.duplicateCircle
                        ? t('admin.reviews.duplicateFound', { name: detail.duplicateCircle.name })
                        : t('admin.reviews.noDuplicate')}
                    </p>
                  </section>
                </>
              ) : null}
              {detail.decisionReason ? (
                <section className="border-l-2 border-ochre/45 pl-3">
                  <div className="text-[10px] font-bold text-ink-muted">{t('admin.reviews.decisionReason')}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-secondary">{detail.decisionReason}</p>
                </section>
              ) : null}
            </div>
          )}
          {detail ? (
            <div className="mt-7 flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
              {detail.status === 'PENDING' ? (
                <>
                  <button type="button" onClick={() => onDecision('APPROVE')} className="inline-flex items-center gap-2 rounded-md border border-moss/30 px-3 py-2 text-xs font-bold text-moss"><Check className="h-3.5 w-3.5" />{t('admin.reviews.approve')}</button>
                  <button type="button" onClick={() => onDecision('REJECT')} className="inline-flex items-center gap-2 rounded-md border border-ochre/30 px-3 py-2 text-xs font-bold text-ochre"><X className="h-3.5 w-3.5" />{t('admin.reviews.reject')}</button>
                </>
              ) : detail.publishedTargetId && (
                detail.type === 'POST' || detail.publishedCircle?.slug
              ) ? (
                <Link
                  href={detail.type === 'POST' ? `/post/${detail.publishedTargetId}` : `/circles/${detail.publishedCircle?.slug ?? ''}`}
                  className="inline-flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-xs font-bold text-copper"
                >
                  <ExternalLink className="h-3.5 w-3.5" />{t('admin.reviews.openPublished')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
