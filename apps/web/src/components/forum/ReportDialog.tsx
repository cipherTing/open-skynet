'use client';

import { useId, useState } from 'react';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { ReportReason, ReportTargetType } from '@skynet/shared';
import { useAppForm } from '@/components/forms/skynet-form';
import { useToast } from '@/components/ui/SignalToast';
import { TerminalAlertDialogCancel, TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton } from '@/components/ui/terminal';
import { ApiError, reportApi } from '@/lib/api';
import { cn } from '@/lib/utils';

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

interface ReportFormValues {
  reason: ReportReason | '';
  evidence: string;
}

const REPORT_FORM_DEFAULTS: ReportFormValues = { reason: '', evidence: '' };

export function ReportDialog({
  targetType,
  targetId,
  targetContentVersion,
  unavailableReason,
  density = 'regular',
}: ReportDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const compact = density === 'compact';
  const form = useAppForm({
    defaultValues: REPORT_FORM_DEFAULTS,
    validators: {
      onSubmit: z.object({
        reason: z.enum(REPORT_REASONS, { error: t('report.chooseReason') }),
        evidence: z.string().max(REPORT_EVIDENCE_MAX_LENGTH),
      }),
    },
    onSubmit: async ({ value }) => {
      if (!value.reason) return;
      setError('');
      try {
        const trimmedEvidence = value.evidence.trim();
        const result = await reportApi.create({
          targetType,
          targetId,
          targetContentVersion,
          reason: value.reason,
          ...(trimmedEvidence ? { evidence: trimmedEvidence } : {}),
        });
        const successMessage = result.created
          ? t('report.created')
          : result.reportId
            ? t('report.alreadySubmitted')
            : t('report.notAccepting');
        toast.success(successMessage);
        setOpen(false);
        form.reset();
      } catch (requestError) {
        setError(requestError instanceof ApiError ? requestError.message : t('report.failed'));
      }
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setError('');
    form.reset();
  };

  return (
    <>
      <button
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
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1 font-mono uppercase tracking-[0.12em] text-[var(--t-faint)] transition-colors [transition-timing-function:steps(2,end)] hover:text-danger',
          unavailableReason && 'hover:text-[var(--t-faint)]',
          compact ? 'text-[10px]' : 'text-[11px]',
        )}
      >
        <Flag className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {`[ ${t('report.action')} ]`}
      </button>

      <form.Subscribe selector={(state) => [state.values, state.isSubmitting] as const}>
        {([values, isSubmitting]) => (
          <TerminalDialog
            open={open}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) closeDialog();
            }}
            title={t('report.title', { target: t(getTargetLabelKey(targetType)) })}
            description={t('report.description')}
            code="REPORT"
            size="md"
            variant="alert"
            busy={isSubmitting}
            contentClassName="t-corner !fixed"
            footer={
              <>
                <TerminalAlertDialogCancel asChild>
                  <TButton variant="secondary" disabled={isSubmitting}>
                    {t('app.cancel')}
                  </TButton>
                </TerminalAlertDialogCancel>
                <TButton
                  type="submit"
                  form={formId}
                  variant="danger"
                  disabled={!values.reason || isSubmitting}
                >
                  {isSubmitting ? t('report.submitting') : t('report.submit')}
                </TButton>
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
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <form.AppForm>
                <form.AppField name="reason">
                  {(field) => (
                    <field.SelectField
                      label={t('report.reason')}
                      placeholder={t('report.chooseReason')}
                      options={REPORT_REASONS.map((reason) => ({
                        value: reason,
                        label: t(`report.reasons.${reason}`),
                      }))}
                    />
                  )}
                </form.AppField>
                <form.AppField name="evidence">
                  {(field) => (
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] tracking-[0.12em] text-text-secondary">
                          {t('report.evidence')}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-text-tertiary">
                          {field.state.value.length}/{REPORT_EVIDENCE_MAX_LENGTH}
                        </span>
                      </div>
                      <field.TextareaField
                        label={<span className="sr-only">{t('report.evidence')}</span>}
                        maxLength={REPORT_EVIDENCE_MAX_LENGTH}
                        rows={4}
                        placeholder={t('report.evidencePlaceholder')}
                        className="resize-y text-sm"
                        description={t('report.evidenceHint')}
                      />
                    </div>
                  )}
                </form.AppField>
                {error ? (
                  <p
                    role="alert"
                    className="border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-xs text-danger"
                  >
                    {error}
                  </p>
                ) : null}
              </form.AppForm>
            </form>
          </TerminalDialog>
        )}
      </form.Subscribe>
    </>
  );
}
