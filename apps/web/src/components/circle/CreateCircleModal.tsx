'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { Circle, ForumCircle } from '@skynet/shared';
import { useAppForm } from '@/components/forms/skynet-form';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, circleApi } from '@/lib/api';
import { circleKeys } from '@/lib/query-keys';

interface CreateCircleModalProps {
  onClose: () => void;
  onCreated: (circle: Circle) => void;
  onSelectExisting: (circle: ForumCircle) => void;
}

const SEARCH_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 300;
const CIRCLE_NAME_MAX_LENGTH = 40;
const CIRCLE_TOPIC_MAX_LENGTH = 160;

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
  return { id: record.id, slug: record.slug, name: record.name, topic: record.topic };
}

export function CreateCircleModal({
  onClose,
  onCreated,
  onSelectExisting,
}: CreateCircleModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { user } = useAuth();
  const viewerKey = user?.id ?? 'anonymous';
  const queryClient = useQueryClient();
  const [nameForSearch, setNameForSearch] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [error, setError] = useState('');
  const [reviewPending, setReviewPending] = useState(false);
  const form = useAppForm({
    defaultValues: { name: '', topic: '' },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .trim()
          .min(1, t('circles.nameRequired'))
          .max(CIRCLE_NAME_MAX_LENGTH, t('circles.nameTooLong')),
        topic: z
          .string()
          .trim()
          .min(1, t('circles.topicRequired'))
          .max(CIRCLE_TOPIC_MAX_LENGTH, t('circles.topicTooLong')),
      }),
    },
    onSubmit: async ({ value }) => {
      if (exactMatch) return;
      setError('');
      try {
        const result = await circleApi.createCircle({
          name: value.name.trim(),
          topic: value.topic.trim(),
        });
        if (result.outcome === 'PENDING_REVIEW') {
          setReviewPending(true);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: circleKeys.root });
        onCreated(result.circle);
      } catch (requestError) {
        if (requestError instanceof ApiError) {
          const existing = toExistingCircleSummary(requestError.details.existingCircle);
          if (requestError.code === 'CIRCLE_DUPLICATE_NAME' && existing) {
            onSelectExisting(existing);
            return;
          }
          if (requestError.code === 'CIRCLE_NOT_ELIGIBLE') {
            setError(t('circles.createNotEligible'));
          } else if (requestError.code === 'CIRCLE_WEEKLY_LIMIT_REACHED') {
            setError(t('circles.weeklyLimitReached'));
          } else {
            setError(requestError.message);
          }
        } else {
          setError(t('circles.createFailed'));
        }
      }
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedName(nameForSearch.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [nameForSearch]);

  const searchQuery = useQuery({
    queryKey: circleKeys.search(viewerKey, debouncedName, SEARCH_LIMIT),
    queryFn: () => circleApi.searchCircles({ q: debouncedName, limit: SEARCH_LIMIT }),
    enabled: debouncedName.length > 0,
  });
  const exactMatch = searchQuery.data?.exactNameMatch ?? null;
  const fuzzyMatches = (searchQuery.data?.items ?? []).filter((item) => item.id !== exactMatch?.id);

  return (
    <form.Subscribe selector={(state) => [state.values, state.isSubmitting] as const}>
      {([values, isSubmitting]) => (
        <TerminalDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) onClose();
          }}
          title={t('circles.createTitle')}
          description={t('circles.createDescription')}
          code="CIRCLE.CREATE"
          size="md"
          busy={isSubmitting}
          footer={
            reviewPending ? (
              <TButton variant="primary" onClick={onClose}>
                {t('app.close')}
              </TButton>
            ) : (
              <>
                <TButton variant="secondary" disabled={isSubmitting} onClick={onClose}>
                  {t('app.cancel')}
                </TButton>
                <TButton
                  type="submit"
                  form={formId}
                  disabled={
                    isSubmitting ||
                    !values.name.trim() ||
                    !values.topic.trim() ||
                    Boolean(exactMatch)
                  }
                >
                  <Send className="h-3 w-3" />
                  {isSubmitting ? t('circles.creating') : t('circles.createSubmit')}
                </TButton>
              </>
            )
          }
        >
          {reviewPending ? (
            <div className="py-6 text-center">
              <div className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)]">
                {t('circles.reviewPendingTitle')}
              </div>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--t-text)]/70">
                {t('circles.reviewPendingDescription')}
              </p>
            </div>
          ) : (
            <form
              id={formId}
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <form.AppForm>
                {error ? (
                  <div
                    role="alert"
                    className="border border-[var(--t-hazard-dim)] bg-[var(--t-hazard-dim)]/20 px-3 py-2 font-sans text-[12px] leading-5 text-[var(--t-hazard)]"
                  >
                    {error}
                  </div>
                ) : null}
                <form.AppField name="name">
                  {(field) => (
                    <field.InputField
                      label={t('circles.name')}
                      placeholder={t('circles.namePlaceholder')}
                      maxLength={CIRCLE_NAME_MAX_LENGTH}
                      onValueChange={setNameForSearch}
                    />
                  )}
                </form.AppField>
                <form.AppField name="topic">
                  {(field) => (
                    <field.TextareaField
                      label={t('circles.topic')}
                      placeholder={t('circles.topicPlaceholder')}
                      maxLength={CIRCLE_TOPIC_MAX_LENGTH}
                      rows={3}
                    />
                  )}
                </form.AppField>

                {debouncedName ? (
                  <div className="border border-[var(--t-noise)] bg-black p-3">
                    {searchQuery.isFetching ? (
                      <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                        {t('circles.searching')}
                      </p>
                    ) : exactMatch ? (
                      <div className="space-y-2">
                        <p className="font-sans text-[12px] font-semibold tracking-normal text-[var(--t-hazard)]/80">
                          {t('circles.exactExists')}
                        </p>
                        <CircleMatchButton
                          circle={exactMatch}
                          onClick={() => onSelectExisting(exactMatch)}
                        />
                      </div>
                    ) : fuzzyMatches.length > 0 ? (
                      <div className="space-y-2">
                        <p className="font-sans text-[12px] font-semibold tracking-normal text-[var(--t-signal)]">
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
                      <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)]">
                        {t('circles.noDuplicate')}
                      </p>
                    )}
                  </div>
                ) : null}
              </form.AppForm>
            </form>
          )}
        </TerminalDialog>
      )}
    </form.Subscribe>
  );
}

function CircleMatchButton({ circle, onClick }: { circle: ForumCircle; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border border-[var(--t-noise)] bg-[var(--t-panel)] px-3 py-2 text-left transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)]/50 hover:bg-[var(--t-accent)]/5"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-white">/{circle.name}</span>
        <span className="mt-0.5 block line-clamp-1 text-xs text-[var(--t-text)]/50">
          {circle.topic}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-accent)]">
        <Check className="h-3.5 w-3.5" />
        {t('circles.selectExisting')}
      </span>
    </button>
  );
}
