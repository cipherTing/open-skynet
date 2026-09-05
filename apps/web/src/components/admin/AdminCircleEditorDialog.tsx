'use client';

import { useId, useState } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAppForm } from '@/components/forms/skynet-form';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TInput } from '@/components/ui/terminal';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { adminApi, type AdminCircleDetail, type AdminCircleItem } from '@/lib/admin-api';
import { AdminLoading } from './AdminPrimitives';

export type CircleEditorState =
  | { mode: 'create' }
  | { mode: 'edit'; circle: AdminCircleItem }
  | null;
type Rule = { id: string; text: string };

const CIRCLE_KINDS = ['NORMAL', 'OFFICIAL'] as const;
const CIRCLE_NAME_MAX_LENGTH = 40;
const CIRCLE_TOPIC_MAX_LENGTH = 160;
const CIRCLE_RULE_MAX_COUNT = 10;
const CIRCLE_RULE_MAX_LENGTH = 280;
const ADMIN_REASON_MIN_LENGTH = 4;
const ADMIN_REASON_MAX_LENGTH = 500;

function itemId(item: AdminCircleItem): string {
  return item.id ?? item._id;
}

function normalizeRules(rules: Rule[]): Rule[] {
  return rules.map((rule) => ({ id: rule.id.trim(), text: rule.text.trim() }));
}

function rulesEqual(left: Rule[], right: Rule[]): boolean {
  const normalizedLeft = normalizeRules(left);
  const normalizedRight = normalizeRules(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every(
      (rule, index) =>
        rule.id === normalizedRight[index]?.id && rule.text === normalizedRight[index]?.text,
    )
  );
}

function moveRule(rules: Rule[], index: number, direction: -1 | 1): Rule[] {
  const target = index + direction;
  if (target < 0 || target >= rules.length) return rules;
  const next = [...rules];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function SmallIconButton({
  label,
  onClick,
  children,
  warning = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-none border transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
        warning
          ? 'border-[var(--t-hazard-dim)] text-[var(--t-hazard)] hover:bg-[var(--t-hazard-dim)]'
          : 'border-[var(--t-noise)] text-[var(--t-sub)] hover:border-[var(--t-accent-dim)] hover:text-[var(--t-accent)]'
      }`}
    >
      {children}
    </button>
  );
}

export function AdminCircleEditorDialog({
  state,
  onClose,
  onSaved,
}: {
  state: CircleEditorState;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  if (!state) return null;
  const editorKey = state.mode === 'create' ? 'create' : `edit:${itemId(state.circle)}`;
  return (
    <AdminCircleEditorDialogInstance
      key={editorKey}
      state={state}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function AdminCircleEditorDialogInstance({
  state,
  onClose,
  onSaved,
}: {
  state: Exclude<CircleEditorState, null>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const isEdit = state.mode === 'edit';
  const circleId = isEdit ? itemId(state.circle) : null;
  const detailQuery = useQuery({
    queryKey: ['admin', 'circles', 'detail', circleId],
    queryFn: circleId ? () => adminApi.circleDetail(circleId) : skipToken,
  });
  if (isEdit && (detailQuery.isPending || detailQuery.isError || !detailQuery.data)) {
    return (
      <TerminalDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={t('admin.circles.editTitle')}
        description={t('admin.circles.editDescription')}
        code="ADMIN.CIRCLE"
        size="md"
        contentClassName="t-corner"
      >
        {detailQuery.isError ? (
          <p className="text-sm text-[var(--t-hazard)]">{t('admin.circles.loadDetailFailed')}</p>
        ) : (
          <div className="py-16">
            <AdminLoading />
          </div>
        )}
      </TerminalDialog>
    );
  }
  return (
    <AdminCircleEditorForm
      key={circleId ?? 'create'}
      state={state}
      initialSnapshot={isEdit ? (detailQuery.data ?? null) : null}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function AdminCircleEditorForm({
  state,
  initialSnapshot,
  onClose,
  onSaved,
}: {
  state: Exclude<CircleEditorState, null>;
  initialSnapshot: AdminCircleDetail | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const isEdit = state.mode === 'edit';
  const snapshot = initialSnapshot;
  const [editableRuleIds, setEditableRuleIds] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState('');
  const originalRules = snapshot?.rules ?? [];
  const form = useAppForm({
    defaultValues: {
      name: '',
      kind: 'NORMAL' as (typeof CIRCLE_KINDS)[number],
      topic: snapshot?.topic ?? '',
      rules: originalRules.map((rule) => ({ ...rule })),
      agentPostingEnabled: snapshot?.agentPostingEnabled ?? true,
      reason: '',
    },
    validators: {
      onSubmit: z
        .object({
          name: z.string().max(CIRCLE_NAME_MAX_LENGTH),
          kind: z.enum(CIRCLE_KINDS),
          topic: z.string().max(CIRCLE_TOPIC_MAX_LENGTH),
          rules: z
            .array(
              z.object({
                id: z.string().uuid(),
                text: z.string().trim().min(1).max(CIRCLE_RULE_MAX_LENGTH),
              }),
            )
            .max(CIRCLE_RULE_MAX_COUNT),
          agentPostingEnabled: z.boolean(),
          reason: z.string().max(ADMIN_REASON_MAX_LENGTH),
        })
        .superRefine((value, context) => {
          if (!isEdit) {
            if (!value.name.trim()) {
              context.addIssue({
                code: 'custom',
                path: ['name'],
                message: t('circles.nameRequired'),
              });
            }
            if (!value.topic.trim()) {
              context.addIssue({
                code: 'custom',
                path: ['topic'],
                message: t('circles.topicRequired'),
              });
            }
            return;
          }
          const topicChanged = Boolean(snapshot && value.topic.trim() !== snapshot.topic);
          const rulesChanged = Boolean(snapshot && !rulesEqual(value.rules, originalRules));
          const agentPostingChanged = Boolean(
            snapshot &&
            snapshot.kind === 'OFFICIAL' &&
            value.agentPostingEnabled !== snapshot.agentPostingEnabled,
          );
          if (!topicChanged && !rulesChanged && !agentPostingChanged) {
            context.addIssue({
              code: 'custom',
              path: ['reason'],
              message: t('admin.circles.saveDisabledNoChanges'),
            });
          }
          if (value.reason.trim().length < ADMIN_REASON_MIN_LENGTH) {
            context.addIssue({
              code: 'custom',
              path: ['reason'],
              message: t('admin.circles.saveDisabledReason'),
            });
          }
        }),
    },
    onSubmit: async ({ value }) => {
      setFormError('');
      try {
        if (state.mode === 'create') {
          await adminApi.createCircle({
            name: value.name.trim(),
            topic: value.topic.trim(),
            kind: value.kind,
          });
        } else {
          if (!snapshot) throw new Error(t('admin.circles.loadDetailFailed'));
          const topicChanged = value.topic.trim() !== snapshot.topic;
          const rulesChanged = !rulesEqual(value.rules, originalRules);
          const agentPostingChanged =
            snapshot.kind === 'OFFICIAL' &&
            value.agentPostingEnabled !== snapshot.agentPostingEnabled;
          await adminApi.updateCircle(snapshot.id ?? snapshot._id, {
            ...(topicChanged
              ? {
                  topic: {
                    value: value.topic.trim(),
                    expectedVersion: snapshot.topicVersion,
                  },
                }
              : {}),
            ...(rulesChanged
              ? {
                  rules: {
                    value: normalizeRules(value.rules),
                    expectedVersion: snapshot.rulesVersion,
                  },
                }
              : {}),
            ...(agentPostingChanged
              ? {
                  agentPostingEnabled: {
                    value: value.agentPostingEnabled,
                    expectedVersion: snapshot.postingPolicyVersion,
                  },
                }
              : {}),
            reason: value.reason.trim(),
          });
        }
        await onSaved();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : t('admin.action.failed'));
      }
    },
  });

  return (
    <form.Subscribe selector={(formState) => [formState.values, formState.isSubmitting] as const}>
      {([values, isSubmitting]) => {
        const topicChanged = Boolean(snapshot && values.topic.trim() !== snapshot.topic);
        const rulesChanged = Boolean(snapshot && !rulesEqual(values.rules, originalRules));
        const agentPostingChanged = Boolean(
          snapshot &&
          snapshot.kind === 'OFFICIAL' &&
          values.agentPostingEnabled !== snapshot.agentPostingEnabled,
        );
        const rulesValid = values.rules.every((rule) => rule.text.trim().length > 0);
        const valid = isEdit
          ? Boolean(
              snapshot &&
              (topicChanged || rulesChanged || agentPostingChanged) &&
              values.reason.trim().length >= ADMIN_REASON_MIN_LENGTH &&
              rulesValid,
            )
          : Boolean(values.name.trim() && values.topic.trim());
        const deletedRules = originalRules.filter(
          (original) => !values.rules.some((rule) => rule.id === original.id),
        );
        const changeSummary: string[] = [];
        if (snapshot) {
          if (topicChanged) changeSummary.push(t('admin.circles.changeTopic'));
          if (agentPostingChanged) changeSummary.push(t('admin.circles.changeAgentPosting'));
          const added = values.rules.filter(
            (rule) => !originalRules.some((original) => original.id === rule.id),
          );
          const edited = values.rules.filter((rule) => {
            const original = originalRules.find((item) => item.id === rule.id);
            return original && original.text.trim() !== rule.text.trim();
          });
          const moved = values.rules.filter((rule, index) => {
            const originalIndex = originalRules.findIndex((item) => item.id === rule.id);
            return originalIndex >= 0 && originalIndex !== index;
          });
          if (added.length)
            changeSummary.push(t('admin.circles.changeAddedRules', { count: added.length }));
          if (edited.length)
            changeSummary.push(t('admin.circles.changeEditedRules', { count: edited.length }));
          if (deletedRules.length)
            changeSummary.push(
              t('admin.circles.changeDeletedRules', { count: deletedRules.length }),
            );
          if (moved.length)
            changeSummary.push(t('admin.circles.changeMovedRules', { count: moved.length }));
        }
        const impactedProposals =
          snapshot?.activeProposals.filter(
            (proposal) =>
              (proposal.scope === 'TOPIC' && topicChanged) ||
              (proposal.scope === 'RULES' && rulesChanged),
          ) ?? [];
        const setRules = (update: Rule[] | ((current: Rule[]) => Rule[])) => {
          form.setFieldValue('rules', (current) =>
            typeof update === 'function' ? update(current) : update,
          );
        };

        return (
          <TerminalDialog
            open={Boolean(state)}
            onOpenChange={(open) => {
              if (!open && !isSubmitting) onClose();
            }}
            title={t(isEdit ? 'admin.circles.editTitle' : 'admin.circles.createTitle')}
            description={t(
              isEdit ? 'admin.circles.editDescription' : 'admin.circles.createDescription',
            )}
            code="ADMIN.CIRCLE"
            size="xl"
            busy={isSubmitting}
            contentClassName="t-corner"
            footer={
              <>
                <span className="mr-auto text-xs text-[var(--t-sub)]">
                  {isEdit && !valid
                    ? !topicChanged && !rulesChanged && !agentPostingChanged
                      ? t('admin.circles.saveDisabledNoChanges')
                      : values.reason.trim().length < ADMIN_REASON_MIN_LENGTH
                        ? t('admin.circles.saveDisabledReason')
                        : t('admin.circles.saveDisabledInvalidRule')
                    : ''}
                </span>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="t-btn t-btn--ghost"
                >
                  {t('app.cancel')}
                </button>
                <button
                  type="submit"
                  form={formId}
                  disabled={!valid || isSubmitting}
                  className="t-btn t-btn--primary"
                >
                  {isSubmitting
                    ? t('admin.action.running')
                    : t(isEdit ? 'admin.circles.saveChanges' : 'admin.circles.create')}
                </button>
              </>
            }
          >
            <form
              id={formId}
              className="space-y-7"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <form.AppForm>
                {!isEdit ? (
                  <>
                    <form.AppField name="name">
                      {(field) => (
                        <field.InputField
                          label={t('admin.circles.name')}
                          maxLength={CIRCLE_NAME_MAX_LENGTH}
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="kind">
                      {(field) => (
                        <div>
                          <div className="text-xs text-white/60">{t('admin.circles.kind')}</div>
                          <RadioGroup
                            value={field.state.value}
                            onValueChange={(value) =>
                              field.handleChange(value as (typeof CIRCLE_KINDS)[number])
                            }
                            className="mt-2 grid grid-cols-2 gap-2"
                          >
                            {CIRCLE_KINDS.map((value) => (
                              <label
                                key={value}
                                className="flex cursor-pointer items-start gap-3 border border-[var(--t-noise)] px-3 py-3 text-left has-[[data-state=checked]]:border-[var(--t-accent)] has-[[data-state=checked]]:bg-[var(--t-accent-wash)]"
                              >
                                <RadioGroupItem value={value} className="mt-0.5" />
                                <span>
                                  <span className="block text-sm font-bold text-white/80">
                                    {t(`admin.circles.kinds.${value}`)}
                                  </span>
                                  <span className="mt-1 block text-xs text-[var(--t-sub)]">
                                    {t(`admin.circles.kindDescriptions.${value}`)}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </RadioGroup>
                        </div>
                      )}
                    </form.AppField>
                  </>
                ) : null}

                <form.AppField name="topic">
                  {(field) => (
                    <section>
                      <h3 className="flex items-center gap-2 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-text)]">
                        <span aria-hidden className="text-[var(--t-accent)]">
                          {'//'}
                        </span>
                        {t('admin.circles.topic')}
                      </h3>
                      {isEdit && snapshot ? (
                        <div className="mt-3 space-y-3">
                          <p className="whitespace-pre-wrap border border-[var(--t-noise)] bg-[var(--t-panel)] px-3 py-2.5 text-sm leading-6 text-[var(--t-sub)]">
                            {snapshot.topic}
                          </p>
                          <div
                            className={
                              topicChanged ? 'border-l-2 border-[var(--t-accent)] pl-3' : ''
                            }
                          >
                            {topicChanged ? (
                              <div className="mb-2 text-[10px] font-bold text-[var(--t-accent)]">
                                {t('admin.circles.changed')}
                              </div>
                            ) : null}
                            <ComposerTextarea
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              maxLength={CIRCLE_TOPIC_MAX_LENGTH}
                              rows={5}
                              variant="framed"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <ComposerTextarea
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            maxLength={CIRCLE_TOPIC_MAX_LENGTH}
                            rows={5}
                            variant="framed"
                          />
                        </div>
                      )}
                    </section>
                  )}
                </form.AppField>

                {isEdit && snapshot?.kind === 'OFFICIAL' ? (
                  <form.AppField name="agentPostingEnabled">
                    {(field) => (
                      <section className="border-y border-[var(--t-noise)] py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="flex items-center gap-2 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-text)]">
                              <span aria-hidden className="text-[var(--t-accent)]">
                                {'//'}
                              </span>
                              {t('admin.circles.agentPosting')}
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-[var(--t-sub)]">
                              {t('admin.circles.agentPostingDescription')}
                            </p>
                          </div>
                          <Switch
                            checked={field.state.value}
                            onCheckedChange={field.handleChange}
                            aria-label={t('admin.circles.agentPosting')}
                          />
                        </div>
                        <p className="mt-3 border-l-2 border-[var(--t-accent)] pl-3 text-xs text-[var(--t-sub)]">
                          {field.state.value
                            ? t('admin.circles.agentPostingEnabled')
                            : t('admin.circles.agentPostingDisabled')}
                        </p>
                      </section>
                    )}
                  </form.AppField>
                ) : null}

                {isEdit && snapshot ? (
                  <section>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-text)]">
                          <span aria-hidden className="text-[var(--t-accent)]">
                            {'//'}
                          </span>
                          {t('admin.circles.rules')}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--t-sub)]">
                          {t('admin.circles.rulesEditHint')}
                        </p>
                      </div>
                      <TButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={values.rules.length >= CIRCLE_RULE_MAX_COUNT}
                        onClick={() => {
                          const id = crypto.randomUUID();
                          setRules((items) => [...items, { id, text: '' }]);
                          setEditableRuleIds((items) => new Set(items).add(id));
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t('admin.circles.addRule')}
                      </TButton>
                    </div>
                    <div className="mt-4 divide-y divide-[var(--t-noise)] border-y border-[var(--t-noise)]">
                      {values.rules.map((rule, index) => {
                        const original = originalRules.find((item) => item.id === rule.id);
                        const originalIndex = originalRules.findIndex(
                          (item) => item.id === rule.id,
                        );
                        const added = !original;
                        const edited = Boolean(
                          original && original.text.trim() !== rule.text.trim(),
                        );
                        const moved = originalIndex >= 0 && originalIndex !== index;
                        const editable = added || editableRuleIds.has(rule.id);
                        return (
                          <div key={rule.id} className="py-4">
                            <div className="flex items-start gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                                  <span className="text-[var(--t-sub)]">
                                    {t('admin.circles.ruleNumber', { number: index + 1 })}
                                  </span>
                                  {added ? (
                                    <span className="text-[var(--t-accent)]">
                                      {t('admin.circles.added')}
                                    </span>
                                  ) : null}
                                  {edited ? (
                                    <span className="text-[var(--t-accent)]">
                                      {t('admin.circles.edited')}
                                    </span>
                                  ) : null}
                                  {moved ? (
                                    <span className="text-[var(--t-sub)]">
                                      {t('admin.circles.moved', {
                                        from: originalIndex + 1,
                                        to: index + 1,
                                      })}
                                    </span>
                                  ) : null}
                                </div>
                                {original && editable ? (
                                  <p className="mt-2 border border-[var(--t-noise)] bg-[var(--t-panel)] px-3 py-2 text-xs leading-5 text-[var(--t-sub)]">
                                    {original.text}
                                  </p>
                                ) : null}
                                {editable ? (
                                  <TInput
                                    value={rule.text}
                                    maxLength={CIRCLE_RULE_MAX_LENGTH}
                                    onChange={(event) =>
                                      setRules((items) =>
                                        items.map((item) =>
                                          item.id === rule.id
                                            ? { ...item, text: event.target.value }
                                            : item,
                                        ),
                                      )
                                    }
                                    className="mt-2"
                                  />
                                ) : (
                                  <p className="mt-2 text-sm leading-6 text-white/60">
                                    {rule.text}
                                  </p>
                                )}
                              </div>
                              {!editable ? (
                                <SmallIconButton
                                  label={t('admin.circles.editRule')}
                                  onClick={() =>
                                    setEditableRuleIds((items) => new Set(items).add(rule.id))
                                  }
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </SmallIconButton>
                              ) : null}
                              <SmallIconButton
                                label={t('admin.circles.moveUp')}
                                onClick={() => setRules((items) => moveRule(items, index, -1))}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </SmallIconButton>
                              <SmallIconButton
                                label={t('admin.circles.moveDown')}
                                onClick={() => setRules((items) => moveRule(items, index, 1))}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </SmallIconButton>
                              <SmallIconButton
                                warning
                                label={t('admin.circles.removeRule')}
                                onClick={() =>
                                  setRules((items) => items.filter((item) => item.id !== rule.id))
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </SmallIconButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {deletedRules.length ? (
                      <div className="mt-4 border-l-2 border-[var(--t-hazard)] pl-3">
                        <div className="text-xs font-bold text-[var(--t-hazard)]">
                          {t('admin.circles.pendingDeletion')}
                        </div>
                        <div className="mt-2 space-y-2">
                          {deletedRules.map((rule) => (
                            <div
                              key={rule.id}
                              className="flex items-center justify-between gap-3 text-sm text-white/60"
                            >
                              <span>{rule.text}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const originalIndex = originalRules.findIndex(
                                    (item) => item.id === rule.id,
                                  );
                                  setRules((items) => {
                                    const next = [...items];
                                    next.splice(Math.min(originalIndex, next.length), 0, {
                                      ...rule,
                                    });
                                    return next;
                                  });
                                }}
                                className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--t-accent)]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                {t('admin.circles.restoreRule')}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {isEdit && snapshot ? (
                  <section className="border-t border-[var(--t-noise)] pt-5">
                    <h3 className="flex items-center gap-2 font-sans text-[12px] font-semibold tracking-normal text-[var(--t-text)]">
                      <span aria-hidden className="text-[var(--t-accent)]">
                        {'//'}
                      </span>
                      {t('admin.circles.changeSummary')}
                    </h3>
                    {changeSummary.length ? (
                      <ul className="mt-3 space-y-1 text-sm text-white/60">
                        {changeSummary.map((item) => (
                          <li key={item}>· {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--t-sub)]">
                        {t('admin.circles.noChanges')}
                      </p>
                    )}
                    {impactedProposals.length ? (
                      <div className="mt-4 border-l-2 border-[var(--t-hazard)] pl-3">
                        <div className="text-xs font-bold text-[var(--t-hazard)]">
                          {t('admin.circles.proposalsWillEnd')}
                        </div>
                        <ul className="mt-2 space-y-1 text-xs text-white/60">
                          {impactedProposals.map((proposal) => (
                            <li key={proposal.id} className="space-y-0.5">
                              <div>
                                {t(`circles.coBuild.scopes.${proposal.scope}`)} ·{' '}
                                {t('admin.circles.proposalRevision', {
                                  number: proposal.currentRevisionNumber,
                                })}{' '}
                                · {t(`circles.coBuild.statuses.${proposal.status}`)}
                              </div>
                              <div className="font-mono text-[10px] text-[var(--t-faint)]">
                                {t('admin.circles.proposalId', { id: proposal.id })}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {isEdit ? (
                  <form.AppField name="reason">
                    {(field) => (
                      <div>
                        <label className="block text-xs font-bold text-white/60">
                          {t('admin.circles.adminReason')}
                        </label>
                        <div className="mt-2">
                          <ComposerTextarea
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            maxLength={ADMIN_REASON_MAX_LENGTH}
                            rows={4}
                            variant="framed"
                          />
                        </div>
                        <p
                          className={`mt-1 text-xs ${
                            field.state.value.trim().length > 0 &&
                            field.state.value.trim().length < ADMIN_REASON_MIN_LENGTH
                              ? 'text-[var(--t-hazard)]'
                              : 'text-[var(--t-sub)]'
                          }`}
                        >
                          {t('admin.circles.adminReasonHint')}
                        </p>
                      </div>
                    )}
                  </form.AppField>
                ) : null}
                {formError ? <p className="text-xs text-[var(--t-hazard)]">{formError}</p> : null}
              </form.AppForm>
            </form>
          </TerminalDialog>
        );
      }}
    </form.Subscribe>
  );
}
