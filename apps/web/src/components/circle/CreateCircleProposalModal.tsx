'use client';

import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type {
  Circle,
  CircleProposalDetail,
  CircleProposalScope,
  CircleRuleItem,
} from '@skynet/shared';
import { useAppForm } from '@/components/forms/skynet-form';
import { useToast } from '@/components/ui/SignalToast';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TInput } from '@/components/ui/terminal';
import { circleApi } from '@/lib/api';
import { RuleChangeDiff, TopicChangeDiff } from './CircleChangeDiff';
import { CoBuildMarkdownComposer } from './CoBuildMarkdownComposer';

const PROPOSAL_SCOPES = ['TOPIC', 'RULES'] as const;
const TOPIC_MAX_LENGTH = 160;
const RULE_MAX_COUNT = 10;
const RULE_MAX_LENGTH = 280;
const REASON_MAX_LENGTH = 4_000;

interface ProposalFormValues {
  scope: CircleProposalScope;
  topic: string;
  rules: CircleRuleItem[];
  reason: string;
}

interface CreateCircleProposalModalProps {
  circle: Circle;
  proposal?: CircleProposalDetail;
  onClose: () => void;
  onCreated: (proposal: CircleProposalDetail) => Promise<void>;
}

function serializeProposal(values: ProposalFormValues): string {
  return JSON.stringify({
    scope: values.scope,
    topic: values.topic.trim(),
    rules: values.rules.map((rule) => ({ id: rule.id, text: rule.text.trim() })),
    reason: values.reason.trim(),
  });
}

export function CreateCircleProposalModal({
  circle,
  proposal,
  onClose,
  onCreated,
}: CreateCircleProposalModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const formId = useId();
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [formError, setFormError] = useState('');
  const currentRevision = proposal?.currentRevision;
  const initialValues: ProposalFormValues = {
    scope: proposal?.scope ?? 'TOPIC',
    topic: currentRevision?.topic ?? circle.topic,
    rules:
      currentRevision?.rules?.map((rule) => ({ ...rule })) ??
      circle.rules.map((rule) => ({ ...rule })),
    reason: '',
  };
  const baselineTopic = currentRevision?.topic ?? circle.topic;
  const baselineRules = currentRevision?.rules ?? circle.rules;
  const form = useAppForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: z
        .object({
          scope: z.enum(PROPOSAL_SCOPES),
          topic: z.string().max(TOPIC_MAX_LENGTH),
          rules: z
            .array(
              z.object({
                id: z.string().uuid(),
                text: z.string().trim().min(1).max(RULE_MAX_LENGTH),
              }),
            )
            .max(RULE_MAX_COUNT),
          reason: z
            .string()
            .trim()
            .min(1, t('circles.coBuild.reasonRequired'))
            .max(REASON_MAX_LENGTH),
        })
        .superRefine((value, context) => {
          if (value.scope === 'TOPIC') {
            if (!value.topic.trim()) {
              context.addIssue({
                code: 'custom',
                path: ['topic'],
                message: t('circles.topicRequired'),
              });
            } else if (value.topic.trim() === baselineTopic) {
              context.addIssue({
                code: 'custom',
                path: ['topic'],
                message: t('circles.coBuild.changeRequired'),
              });
            }
            return;
          }
          if (value.rules.some((rule) => !rule.text.trim())) {
            context.addIssue({
              code: 'custom',
              path: ['rules'],
              message: t('circles.coBuild.ruleRequired'),
            });
          } else if (JSON.stringify(value.rules) === JSON.stringify(baselineRules)) {
            context.addIssue({
              code: 'custom',
              path: ['rules'],
              message: t('circles.coBuild.changeRequired'),
            });
          }
        }),
    },
    onSubmit: async ({ value }) => {
      setFormError('');
      const normalizedValues: ProposalFormValues = {
        ...value,
        topic: value.topic.trim(),
        rules: value.rules.map((rule) => ({ ...rule, text: rule.text.trim() })),
        reason: value.reason.trim(),
      };
      const fingerprint = serializeProposal(normalizedValues);
      const existingKey = idempotencyRef.current;
      const idempotencyKey =
        existingKey?.fingerprint === fingerprint ? existingKey.key : crypto.randomUUID();
      idempotencyRef.current = { fingerprint, key: idempotencyKey };
      try {
        const result = proposal
          ? await circleApi.reviseProposal(
              circle.id,
              proposal.id,
              {
                expectedVersion: proposal.version,
                reason: normalizedValues.reason,
                ...(normalizedValues.scope === 'TOPIC'
                  ? { topic: normalizedValues.topic }
                  : { rules: normalizedValues.rules }),
              },
              idempotencyKey,
            )
          : await circleApi.createProposal(
              circle.id,
              {
                scope: normalizedValues.scope,
                expectedVersion:
                  normalizedValues.scope === 'TOPIC' ? circle.topicVersion : circle.rulesVersion,
                reason: normalizedValues.reason,
                ...(normalizedValues.scope === 'TOPIC'
                  ? { topic: normalizedValues.topic }
                  : { rules: normalizedValues.rules }),
              },
              idempotencyKey,
            );
        idempotencyRef.current = null;
        toast.success(t(proposal ? 'circles.coBuild.revised' : 'circles.coBuild.created'));
        await onCreated(result);
        onClose();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t(proposal ? 'circles.coBuild.reviseFailed' : 'circles.coBuild.createFailed');
        setFormError(message);
        toast.error(message);
      }
    },
  });

  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit] as const}>
      {([isSubmitting, canSubmit]) => (
        <TerminalDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !isSubmitting) onClose();
          }}
          title={t(proposal ? 'circles.coBuild.reviseTitle' : 'circles.coBuild.createTitle')}
          description={t(
            proposal ? 'circles.coBuild.reviseDescription' : 'circles.coBuild.createDescription',
          )}
          code="CIRCLE.PROPOSAL"
          size="lg"
          busy={isSubmitting}
          footer={
            <>
              <TButton type="button" variant="secondary" disabled={isSubmitting} onClick={onClose}>
                {t('circles.coBuild.cancel')}
              </TButton>
              <TButton
                type="submit"
                form={formId}
                variant="primary"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting
                  ? t(proposal ? 'circles.coBuild.revising' : 'circles.coBuild.submitting')
                  : t(proposal ? 'circles.coBuild.revise' : 'circles.coBuild.submit')}
              </TButton>
            </>
          }
        >
          <form
            id={formId}
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.AppForm>
              {formError ? (
                <p
                  role="alert"
                  className="border border-danger/30 border-l-2 border-l-danger bg-danger/10 px-3 py-2 text-xs text-danger"
                >
                  {formError}
                </p>
              ) : null}

              <form.AppField name="scope">
                {(field) => (
                  <field.RadioGroupField
                    label={t('circles.coBuild.scope')}
                    disabled={Boolean(proposal) || isSubmitting}
                    options={PROPOSAL_SCOPES.map((scope) => ({
                      value: scope,
                      label: t(`circles.coBuild.scopes.${scope}`),
                    }))}
                  />
                )}
              </form.AppField>

              <form.Subscribe selector={(state) => state.values.scope}>
                {(scope) =>
                  scope === 'TOPIC' ? (
                    <form.AppField name="topic">
                      {(field) => (
                        <div className="space-y-3">
                          <div>
                            <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                              {t('circles.coBuild.currentTopic')}
                            </p>
                            <p className="mt-2 border border-[var(--t-noise)] bg-black px-3 py-2.5 text-sm leading-6 text-[var(--t-text)]/50">
                              {circle.topic}
                            </p>
                          </div>
                          <field.InputField
                            label={t('circles.coBuild.changeTo')}
                            maxLength={TOPIC_MAX_LENGTH}
                          />
                          <TopicChangeDiff
                            before={circle.topic}
                            after={field.state.value.trim() || null}
                          />
                        </div>
                      )}
                    </form.AppField>
                  ) : (
                    <form.AppField name="rules">
                      {(field) => (
                        <div>
                          <RuleEditor
                            baseRules={circle.rules}
                            rules={field.state.value}
                            onChange={field.handleChange}
                          />
                          <div className="mt-3">
                            <RuleChangeDiff before={circle.rules} after={field.state.value} />
                          </div>
                        </div>
                      )}
                    </form.AppField>
                  )
                }
              </form.Subscribe>

              <form.AppField name="reason">
                {(field) => (
                  <CoBuildMarkdownComposer
                    value={field.state.value}
                    onChange={field.handleChange}
                    label={t('circles.coBuild.reason')}
                    placeholder={t('circles.coBuild.reasonPlaceholder')}
                    editLabel={t('circles.coBuild.edit')}
                    previewLabel={t('circles.coBuild.preview')}
                    emptyPreview={t('circles.coBuild.emptyPreview')}
                  />
                )}
              </form.AppField>
            </form.AppForm>
          </form>
        </TerminalDialog>
      )}
    </form.Subscribe>
  );
}

function RuleEditor({
  baseRules,
  rules,
  onChange,
}: {
  baseRules: CircleRuleItem[];
  rules: CircleRuleItem[];
  onChange: (rules: CircleRuleItem[]) => void;
}) {
  const { t } = useTranslation();
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const originalById = new Map(baseRules.map((rule) => [rule.id, rule]));
  const removedRules = baseRules.filter(
    (baseRule) => !rules.some((rule) => rule.id === baseRule.id),
  );
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const beginEdit = (id: string) => setEditingIds((items) => new Set(items).add(id));
  const stopEdit = (id: string) =>
    setEditingIds((items) => {
      const next = new Set(items);
      next.delete(id);
      return next;
    });
  const remove = (rule: CircleRuleItem) => {
    onChange(rules.filter((item) => item.id !== rule.id));
  };
  const restore = (rule: CircleRuleItem) => {
    const originalIndex = baseRules.findIndex((item) => item.id === rule.id);
    const next = [...rules];
    next.splice(Math.min(Math.max(originalIndex, 0), next.length), 0, rule);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
          {t('circles.coBuild.currentRules')}
        </p>
        <TButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={rules.length >= RULE_MAX_COUNT}
          onClick={() => {
            const id = crypto.randomUUID();
            onChange([...rules, { id, text: '' }]);
            beginEdit(id);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('circles.coBuild.addRule')}
        </TButton>
      </div>
      <div className="space-y-2">
        {rules.length === 0 ? (
          <p className="border border-dashed border-[var(--t-noise)] px-3 py-5 text-center font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
            {t('circles.coBuild.noProposedRules')}
          </p>
        ) : null}
        {rules.map((rule, index) => (
          <div key={rule.id} className="border border-[var(--t-noise)] bg-black p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-5 text-center font-mono text-xs tabular-nums text-[var(--t-faint)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={`border px-2 py-0.5 font-sans text-[12px] font-medium tracking-normal ${
                    originalById.has(rule.id)
                      ? 'border-[var(--t-noise)] text-[var(--t-faint)]'
                      : 'border-[var(--t-accent)]/50 bg-[var(--t-accent)]/10 text-[var(--t-accent)]'
                  }`}
                >
                  {t(
                    originalById.has(rule.id)
                      ? 'circles.coBuild.ruleExisting'
                      : 'circles.coBuild.ruleAdded',
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={t('circles.coBuild.moveUp')}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="flex h-8 w-8 items-center justify-center border border-[var(--t-noise)] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white disabled:opacity-35"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title={t('circles.coBuild.moveDown')}
                  onClick={() => move(index, 1)}
                  disabled={index === rules.length - 1}
                  className="flex h-8 w-8 items-center justify-center border border-[var(--t-noise)] text-[var(--t-sub)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white disabled:opacity-35"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title={t('circles.coBuild.editRule')}
                  onClick={() => beginEdit(rule.id)}
                  className="flex h-8 w-8 items-center justify-center border border-[var(--t-noise)] text-[var(--t-accent)]/80 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-accent)]/10"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title={t('circles.coBuild.removeRule')}
                  onClick={() => remove(rule)}
                  className="flex h-8 w-8 items-center justify-center border border-[var(--t-noise)] text-[var(--t-hazard)]/80 transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[var(--t-hazard-dim)]/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {editingIds.has(rule.id) ? (
              <div className="mt-3 space-y-2">
                {originalById.has(rule.id) ? (
                  <p className="border border-[var(--t-noise)] bg-[var(--t-panel)] px-3 py-2 text-sm text-[var(--t-text)]/50">
                    {t('circles.coBuild.originalRule')}：{originalById.get(rule.id)?.text}
                  </p>
                ) : (
                  <p className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)]">
                    {t('circles.coBuild.newRule')}
                  </p>
                )}
                <label className="block font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
                  {originalById.has(rule.id)
                    ? t('circles.coBuild.changeTo')
                    : t('circles.coBuild.ruleContent')}
                  <TInput
                    autoFocus
                    value={rule.text}
                    maxLength={RULE_MAX_LENGTH}
                    onChange={(event) =>
                      onChange(
                        rules.map((item) =>
                          item.id === rule.id ? { ...item, text: event.target.value } : item,
                        ),
                      )
                    }
                    className="mt-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => stopEdit(rule.id)}
                  className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
                >
                  {t('circles.coBuild.finishEditing')}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--t-text)]">{rule.text}</p>
            )}
          </div>
        ))}
        {removedRules.map((rule) => (
          <div
            key={rule.id}
            className="border border-[var(--t-hazard-dim)] bg-[var(--t-hazard-dim)]/10 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="border border-[var(--t-hazard-dim)] bg-[var(--t-hazard-dim)]/20 px-2 py-0.5 font-sans text-[12px] font-medium tracking-normal text-[var(--t-hazard)]/80">
                {t('circles.coBuild.ruleDeleted')}
              </span>
              <button
                type="button"
                onClick={() => restore(rule)}
                className="font-sans text-[12px] font-medium tracking-normal text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
              >
                {t('circles.coBuild.restoreRule')}
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--t-text)]/40 line-through">
              {rule.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
