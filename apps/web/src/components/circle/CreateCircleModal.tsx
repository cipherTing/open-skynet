'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Send, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ApiError, circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';
import { useAuth } from '@/contexts/AuthContext';
import type { Circle, ForumCircle } from '@skynet/shared';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';

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
    document.body.style.overflow = 'hidden';
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

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
  const createDisabled =
    submitting || !name.trim() || !topic.trim() || Boolean(exactMatch);

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-void/45 backdrop-blur-[2px]" />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="signal-bubble relative mx-4 w-full max-w-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-circle-title"
      >
        <div className="flex items-center justify-between border-b border-copper/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-moss" />
            <span id="create-circle-title" className="font-mono text-xs tracking-wider text-moss">
              {t('circles.createTitle')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('app.close')}
            className="rounded-md p-1 text-ink-muted transition-colors hover:bg-ochre/5 hover:text-ochre"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {reviewPending ? (
            <div className="py-6 text-center">
              <div className="text-base font-bold text-ink-primary">{t('circles.reviewPendingTitle')}</div>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-secondary">{t('circles.reviewPendingDescription')}</p>
              <button type="button" onClick={onClose} className="mt-6 rounded-md bg-copper px-4 py-2 text-sm font-bold text-void">{t('app.close')}</button>
            </div>
          ) : (
            <>
          {error && (
            <div className="rounded-md border border-ochre/20 bg-ochre/10 px-3 py-2 text-[12px] text-ochre">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
              {t('circles.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('circles.namePlaceholder')}
              className="skynet-input w-full rounded-lg px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-deck-normal text-copper">
              {t('circles.topic')}
            </label>
            <ComposerTextarea
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={t('circles.topicPlaceholder')}
              rows={3}
              variant="framed"
            />
          </div>

          {debouncedName && (
            <div className="rounded-lg border border-copper/10 bg-void-deep/45 p-3">
              {searchQuery.isFetching ? (
                <p className="text-xs text-ink-muted">{t('circles.searching')}</p>
              ) : exactMatch ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-ochre">{t('circles.exactExists')}</p>
                  <CircleMatchButton circle={exactMatch} onClick={() => onSelectExisting(exactMatch)} />
                </div>
              ) : fuzzyMatches.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-steel">{t('circles.relatedMatches')}</p>
                  {fuzzyMatches.slice(0, 5).map((circle) => (
                    <CircleMatchButton key={circle.id} circle={circle} onClick={() => onSelectExisting(circle)} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-moss">{t('circles.noDuplicate')}</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-copper/15 px-4 py-2 text-[12px] tracking-wide text-ink-secondary transition-all hover:border-copper/30 hover:text-ink-primary"
            >
              {t('app.cancel')}
            </button>
            <button
              type="button"
              disabled={createDisabled}
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-lg bg-copper px-4 py-2 text-[12px] font-bold tracking-wide text-void transition-all hover:bg-copper-dim disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-3 w-3" />
              {submitting ? t('circles.creating') : t('circles.createSubmit')}
            </button>
          </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CircleMatchButton({ circle, onClick }: { circle: ForumCircle; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-copper/10 bg-void-mid/55 px-3 py-2 text-left transition-all hover:border-copper/25 hover:bg-copper/5"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-copper">/{circle.name}</span>
        <span className="mt-0.5 block line-clamp-1 text-xs text-ink-muted">{circle.topic}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-moss">
        <Check className="h-3.5 w-3.5" />
        {t('circles.selectExisting')}
      </span>
    </button>
  );
}
