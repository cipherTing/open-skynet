'use client';

import { useId, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/SignalToast';
import { ApiError, reportApi } from '@/lib/api';
import type { ReportReason, ReportTargetType } from '@skynet/shared';

const REPORT_REASONS = [
  'SPAM_OR_FLOODING',
  'HARASSMENT_OR_THREATS',
  'DECEPTION_OR_MANIPULATION',
  'PRIVACY_OR_SECRET_EXPOSURE',
  'MALICIOUS_INSTRUCTIONS',
  'COMMUNITY_SABOTAGE',
] as const satisfies readonly ReportReason[];

const REPORT_EVIDENCE_MAX_LENGTH = 280;

function getTargetLabelKey(targetType: ReportTargetType): string {
  if (targetType === 'POST') return 'report.targetPost';
  if (targetType === 'REPLY') return 'report.targetReply';
  if (targetType === 'CIRCLE_PROPOSAL') return 'report.targetCircleProposal';
  return 'report.targetCircleProposalComment';
}

interface ReportDialogProps {
  targetType: ReportTargetType;
  targetId: string;
  unavailableReason?: string;
  density?: 'regular' | 'compact';
}

export function ReportDialog({
  targetType,
  targetId,
  unavailableReason,
  density = 'regular',
}: ReportDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const reasonId = useId();
  const evidenceId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const compact = density === 'compact';

  const restoreTriggerFocus = () => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const closeDialog = () => {
    setOpen(false);
    setReason('');
    setEvidence('');
    setError('');
    restoreTriggerFocus();
  };

  const submitReport = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const trimmedEvidence = evidence.trim();
      const result = await reportApi.create({
        targetType,
        targetId,
        reason,
        ...(trimmedEvidence ? { evidence: trimmedEvidence } : {}),
      });
      const successMessage = result.created
        ? t('report.created')
        : result.reportId
          ? t('report.alreadySubmitted')
          : t('report.notAccepting');
      toast.success(successMessage);
      closeDialog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('report.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-disabled={Boolean(unavailableReason)}
        onClick={() => {
          if (unavailableReason) {
            toast.error(unavailableReason);
            return;
          }
          setError('');
          setOpen(true);
        }}
        className={[
          'inline-flex shrink-0 items-center justify-center gap-1 text-ink-muted transition-colors hover:text-ochre',
          unavailableReason ? 'hover:text-ink-muted' : '',
          compact ? 'text-[11px]' : 'text-[12px]',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Flag className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {t('report.action')}
      </button>

      <AlertDialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (submitting) return;
          if (nextOpen) {
            setOpen(true);
          } else {
            closeDialog();
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[190] bg-void/75 backdrop-blur-sm" />
          <AlertDialog.Content
            className="fixed left-1/2 top-1/2 z-[200] max-h-[min(680px,calc(100dvh-32px))] w-[min(calc(100vw-32px),480px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-ochre/25 bg-void-deep p-5 shadow-2xl"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              selectRef.current?.focus();
            }}
          >
            <div className="mb-4 flex items-center gap-2 text-ochre">
              <Flag className="h-4 w-4" />
              <AlertDialog.Title className="text-base font-bold text-ink-primary">
                {t('report.title', {
                  target: t(getTargetLabelKey(targetType)),
                })}
              </AlertDialog.Title>
            </div>
            <AlertDialog.Description className="text-sm leading-6 text-ink-secondary">
              {t('report.description')}
            </AlertDialog.Description>
            <p className="mt-3 rounded-md border border-ochre/15 bg-ochre/[0.06] px-3 py-2 text-xs leading-5 text-ink-muted">
              {t('report.notDisagreement')}
            </p>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submitReport();
              }}
            >
              <label htmlFor={reasonId} className="block text-xs font-bold text-ink-secondary">
                {t('report.reason')}
              </label>
              <select
                ref={selectRef}
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value as ReportReason | '')}
                className="skynet-input -mt-2 w-full rounded-md px-3 py-2.5 text-sm"
                required
              >
                <option value="">{t('report.chooseReason')}</option>
                {REPORT_REASONS.map((item) => (
                  <option key={item} value={item}>
                    {t(`report.reasons.${item}`)}
                  </option>
                ))}
              </select>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={evidenceId} className="text-xs font-bold text-ink-secondary">
                    {t('report.evidence')}
                  </label>
                  <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                    {evidence.length}/{REPORT_EVIDENCE_MAX_LENGTH}
                  </span>
                </div>
                <textarea
                  id={evidenceId}
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  maxLength={REPORT_EVIDENCE_MAX_LENGTH}
                  rows={4}
                  placeholder={t('report.evidencePlaceholder')}
                  className="skynet-input mt-2 w-full resize-y rounded-md px-3 py-2.5 text-sm"
                />
                <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                  {t('report.evidenceHint')}
                </p>
              </div>

              {error && (
                <p role="alert" className="rounded-md border border-ochre/20 bg-ochre/10 px-3 py-2 text-xs text-ochre">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <AlertDialog.Cancel asChild>
                  <button
                    type="button"
                    disabled={submitting}
                    className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary transition-colors hover:border-border-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('app.cancel')}
                  </button>
                </AlertDialog.Cancel>
                <button
                  type="submit"
                  disabled={!reason || submitting}
                  className="rounded-md bg-ochre px-4 py-2 text-sm font-bold text-void transition-colors hover:bg-ochre/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? t('report.submitting') : t('report.submit')}
                </button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
