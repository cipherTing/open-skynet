'use client';

import { useId, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/SignalToast';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
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
  targetContentVersion: number;
  unavailableReason?: string;
  density?: 'regular' | 'compact';
}

export function ReportDialog({
  targetType,
  targetId,
  targetContentVersion,
  unavailableReason,
  density = 'regular',
}: ReportDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const reasonId = useId();
  const evidenceId = useId();
  const formId = useId();
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
        targetContentVersion,
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
          'inline-flex shrink-0 items-center justify-center gap-1 font-mono uppercase tracking-[0.12em] text-[#3A5A3A] transition-colors [transition-timing-function:steps(2,end)] hover:text-danger',
          unavailableReason ? 'hover:text-[#3A5A3A]' : '',
          compact ? 'text-[10px]' : 'text-[11px]',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Flag className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {`[ ${t('report.action')} ]`}
      </button>

      <TerminalDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (submitting) return;
          if (nextOpen) {
            setOpen(true);
          } else {
            closeDialog();
          }
        }}
        title={t('report.title', { target: t(getTargetLabelKey(targetType)) })}
        code="REPORT"
        size="md"
        variant="alert"
        contentClassName="t-corner !fixed"
        footer={
          <>
            <button
              type="button"
              disabled={submitting}
              onClick={closeDialog}
              className="t-btn t-btn--ghost"
            >
              {t('app.cancel')}
            </button>
            <button
              type="submit"
              form={formId}
              disabled={!reason || submitting}
              className="t-btn t-btn--danger"
            >
              {submitting ? t('report.submitting') : t('report.submit')}
            </button>
          </>
        }
      >
        <p className="text-sm leading-6 text-text-secondary">{t('report.description')}</p>
        <p className="mt-3 border border-danger/25 bg-danger/5 px-3 py-2 text-xs leading-5 text-text-secondary">
          {t('report.notDisagreement')}
        </p>

        <form
          id={formId}
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitReport();
          }}
        >
          <label
            htmlFor={reasonId}
            className="block font-mono text-[11px] tracking-[0.12em] text-text-secondary"
          >
            {t('report.reason')}
          </label>
          <select
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason | '')}
            className="skynet-input -mt-2 w-full px-3 py-2.5 text-sm"
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
              <label
                htmlFor={evidenceId}
                className="font-mono text-[11px] tracking-[0.12em] text-text-secondary"
              >
                {t('report.evidence')}
              </label>
              <span className="font-mono text-[11px] tabular-nums text-text-tertiary">
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
              className="skynet-input mt-2 w-full resize-y px-3 py-2.5 text-sm"
            />
            <p className="mt-1.5 text-[11px] leading-5 text-text-tertiary">
              {t('report.evidenceHint')}
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </p>
          )}
        </form>
      </TerminalDialog>
    </>
  );
}
