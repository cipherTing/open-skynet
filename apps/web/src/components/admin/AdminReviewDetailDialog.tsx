'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/lib/admin-api';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { Timecode } from '@/components/ui/terminal';
import { AdminError, AdminLoading, StatusText } from './AdminPrimitives';
import { PostTags } from '@/components/forum/PostTags';

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
    <TerminalDialog
      open={Boolean(reviewId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('adminDialogs.reviewTitle')}
      code="ADMIN.REVIEW"
      size="lg"
      contentClassName="t-corner"
      footer={
        detail ? (
          <>
            {detail.status === 'PENDING' ? (
              <>
                <button
                  type="button"
                  onClick={() => onDecision('APPROVE')}
                  className="t-btn t-btn--primary"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t('admin.reviews.approve')}
                </button>
                <button
                  type="button"
                  onClick={() => onDecision('REJECT')}
                  className="t-btn t-btn--danger"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('admin.reviews.reject')}
                </button>
              </>
            ) : detail.publishedTargetId &&
              (detail.type === 'POST' || detail.publishedCircle?.slug) ? (
              <Link
                href={
                  detail.type === 'POST'
                    ? `/post/${detail.publishedTargetId}`
                    : `/circles/${detail.publishedCircle?.slug ?? ''}`
                }
                className="t-btn t-btn--ghost"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('admin.reviews.openPublished')}
              </Link>
            ) : null}
          </>
        ) : undefined
      }
    >
      <p className="text-xs text-[var(--t-sub)]">{t('admin.reviews.detailDescription')}</p>
      <p aria-hidden className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--t-faint)]">
        FILE #REVIEW-{reviewId}
      </p>
      {query.isPending ? (
        <div className="py-16">
          <AdminLoading />
        </div>
      ) : query.isError || !detail ? (
        <div className="py-10">
          <AdminError retry={() => void query.refetch()} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[var(--t-noise)] py-3 text-xs text-white/60">
            <span>{t(`admin.reviews.types.${detail.type}`)}</span>
            <StatusText warning={detail.status === 'REJECTED'}>
              {t(`admin.reviews.statuses.${detail.status}`)}
            </StatusText>
            <span>{detail.requester.name}</span>
            <Timecode date={detail.createdAt} withDate />
          </div>
          {detail.type === 'POST' && 'title' in detail.payload ? (
            <>
              <section>
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('admin.reviews.postTitle')}
                </div>
                <h3 className="mt-1 text-lg font-bold text-[var(--t-text)]">{detail.payload.title}</h3>
              </section>
              <section>
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('createPost.tags')}
                </div>
                <div className="mt-2">
                  <PostTags tags={detail.payload.tags} />
                </div>
              </section>
              <section>
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('admin.reviews.postBody')}
                </div>
                <div className="prose prose-sm mt-3 max-w-none text-white/60">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                    {detail.payload.content}
                  </ReactMarkdown>
                </div>
              </section>
              <section className="border-l-2 border-[var(--t-faint)] pl-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('admin.reviews.targetCircle')}
                </div>
                <p className="mt-1 text-sm text-white/60">
                  {detail.circle?.name ?? t('admin.reviews.circleUnavailable')}
                </p>
              </section>
            </>
          ) : detail.type === 'CIRCLE' && 'name' in detail.payload ? (
            <>
              <section>
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('admin.circles.name')}
                </div>
                <h3 className="mt-1 text-lg font-bold text-[var(--t-text)]">{detail.payload.name}</h3>
              </section>
              <section>
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('admin.circles.topic')}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60">
                  {detail.payload.topic}
                </p>
              </section>
              <section
                className={`border-l-2 pl-3 ${detail.duplicateCircle ? 'border-[var(--t-hazard)]' : 'border-[var(--t-accent)]'}`}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {t('admin.reviews.duplicateCheck')}
                </div>
                <p className="mt-1 text-sm text-white/60">
                  {detail.duplicateCircle
                    ? t('admin.reviews.duplicateFound', { name: detail.duplicateCircle.name })
                    : t('admin.reviews.noDuplicate')}
                </p>
              </section>
            </>
          ) : null}
          {detail.decisionReason ? (
            <section className="border-l-2 border-[var(--t-hazard)] pl-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('admin.reviews.decisionReason')}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/60">
                {detail.decisionReason}
              </p>
            </section>
          ) : null}
        </div>
      )}
    </TerminalDialog>
  );
}
