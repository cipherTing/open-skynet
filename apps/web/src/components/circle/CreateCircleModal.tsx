'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError, circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';
import type { Circle, ForumCircle } from '@skynet/shared';
import { TButton, TInput, TTextarea } from '@/components/ui/terminal';
import { TerminalDialog } from '@/components/ui/TerminalDialog';

interface CreateCircleModalProps {
  onClose: () => void;
  onCreated: (circle: Circle) => void;
  onSelectExisting: (circle: ForumCircle) => void;
}

const SEARCH_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 300;

function toExistingCircleSummary(value: unknown): ForumCircle | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.slug !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.topic !== 'string'
  ) {
    return null;
  }
  const summary: ForumCircle = {
    id: record.id,
    slug: record.slug,
    name: record.name,
    topic: record.topic,
  };
  return summary;
}

export function CreateCircleModal({
  onClose,
  onCreated,
  onSelectExisting,
}: CreateCircleModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reviewPending, setReviewPending] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedName(name.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [name]);

  const searchQuery = useQuery({
    queryKey: circleKeys.search(viewerKey, debouncedName, SEARCH_LIMIT),
    queryFn: () => circleApi.searchCircles({ q: debouncedName, limit: SEARCH_LIMIT }),
    enabled: debouncedName.length > 0,
  });

  const exactMatch = searchQuery.data?.exactNameMatch ?? null;
  const fuzzyMatches = useMemo(
    () => (searchQuery.data?.items ?? []).filter((item) => item.id !== exactMatch?.id),
    [exactMatch?.id, searchQuery.data?.items],
  );
  const createDisabled = submitting || !name.trim() || !topic.trim() || Boolean(exactMatch);

  const handleCreate = async () => {
    if (createDisabled) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await circleApi.createCircle({
        name: name.trim(),
        topic: topic.trim(),
      });
      if (result.outcome === 'PENDING_REVIEW') {
        setReviewPending(true);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: circleKeys.root });
      onCreated(result.circle);
    } catch (err) {
      if (err instanceof ApiError) {
        const existing = toExistingCircleSummary(err.details.existingCircle);
        if (err.code === 'CIRCLE_DUPLICATE_NAME' && existing) {
          onSelectExisting(existing);
          return;
        }
        if (err.code === 'CIRCLE_NOT_ELIGIBLE') {
          setError(t('circles.createNotEligible'));
        } else if (err.code === 'CIRCLE_WEEKLY_LIMIT_REACHED') {
          setError(t('circles.weeklyLimitReached'));
        } else {
          setError(err.message);
        }
      } else {
        setError(t('circles.createFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TerminalDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('circles.createTitle')}
      code="CIRCLE.CREATE"
      size="md"
      footer={
        reviewPending ? (
          <TButton variant="primary" onClick={onClose}>
            {t('app.close')}
          </TButton>
        ) : (
          <>
            <TButton variant="secondary" onClick={onClose}>
              {t('app.cancel')}
            </TButton>
            <TButton variant="primary" disabled={createDisabled} onClick={handleCreate}>
              <Send className="h-3 w-3" />
              {submitting ? t('circles.creating') : t('circles.createSubmit')}
            </TButton>
          </>
        )
      }
    >
      {reviewPending ? (
        <div className="py-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#ADFF2F]">
            {t('circles.reviewPendingTitle')}
          </div>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#EDF3ED]/70">
            {t('circles.reviewPendingDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="border border-[#7F1D1D] bg-[#7F1D1D]/20 px-3 py-2 font-mono text-[12px] text-[#EF4444]">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('circles.name')}
            </label>
            <TInput
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('circles.namePlaceholder')}
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.15em] text-[#3A5A3A]">
              {t('circles.topic')}
            </label>
            <TTextarea
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={t('circles.topicPlaceholder')}
              rows={3}
            />
          </div>

          {debouncedName && (
            <div className="border border-[#1A2E1A] bg-black p-3">
              {searchQuery.isFetching ? (
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#3A5A3A]">
                  {t('circles.searching')}
                </p>
              ) : exactMatch ? (
                <div className="space-y-2">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#EF4444]/80">
                    {t('circles.exactExists')}
                  </p>
                  <CircleMatchButton
                    circle={exactMatch}
                    onClick={() => onSelectExisting(exactMatch)}
                  />
                </div>
              ) : fuzzyMatches.length > 0 ? (
                <div className="space-y-2">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#A16207]">
                    {t('circles.relatedMatches')}
                  </p>
                  {fuzzyMatches.slice(0, 5).map((circle) => (
                    <CircleMatchButton
                      key={circle.id}
                      circle={circle}
                      onClick={() => onSelectExisting(circle)}
                    />
                  ))}
                </div>
              ) : (
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#ADFF2F]">
                  {t('circles.noDuplicate')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </TerminalDialog>
  );
}

function CircleMatchButton({ circle, onClick }: { circle: ForumCircle; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border border-[#1A2E1A] bg-[#040704] px-3 py-2 text-left transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F]/50 hover:bg-[#ADFF2F]/5"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-white">/{circle.name}</span>
        <span className="mt-0.5 block line-clamp-1 text-xs text-[#EDF3ED]/50">{circle.topic}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#ADFF2F]">
        <Check className="h-3.5 w-3.5" />
        {t('circles.selectExisting')}
      </span>
    </button>
  );
}
