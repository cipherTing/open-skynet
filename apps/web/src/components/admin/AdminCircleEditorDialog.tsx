'use client';

import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import {
  adminApi,
  type AdminCircleDetail,
  type AdminCircleItem,
} from '@/lib/admin-api';
import { AdminLoading } from './AdminPrimitives';

type CircleEditorState = { mode: 'create' | 'edit'; circle?: AdminCircleItem } | null;
type Rule = { id: string; text: string };

function itemId(item: AdminCircleItem): string {
  return item.id ?? item._id;
}

function normalizeRules(rules: Rule[]): Rule[] {
  return rules.map((rule) => ({ id: rule.id.trim(), text: rule.text.trim() }));
}

function rulesEqual(left: Rule[], right: Rule[]): boolean {
  const normalizedLeft = normalizeRules(left);
  const normalizedRight = normalizeRules(right);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every(
    (rule, index) =>
      rule.id === normalizedRight[index]?.id && rule.text === normalizedRight[index]?.text,
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
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
        warning
          ? 'border-ochre/25 text-ochre hover:bg-ochre/10'
          : 'border-border-subtle text-ink-muted hover:border-border-accent hover:text-copper'
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
  const editorKey = state.mode === 'create'
    ? 'create'
    : `edit:${itemId(state.circle!)}`;
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
  const circleId = state.circle ? itemId(state.circle) : null;
  const detailQuery = useQuery({
    queryKey: ['admin', 'circles', 'detail', circleId],
    queryFn: () => adminApi.circleDetail(circleId!),
    enabled: Boolean(isEdit && circleId),
  });
  if (isEdit && (detailQuery.isPending || detailQuery.isError || !detailQuery.data)) {
    return (
      <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/45 backdrop-blur-[2px]" />
          <Dialog.Content className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] w-[min(calc(100vw-32px),520px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border-default bg-void-deep p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-base font-bold text-ink-primary">
                {t('admin.circles.editTitle')}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t('app.close')}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            {detailQuery.isError ? (
              <p className="mt-6 text-sm text-ochre">{t('admin.circles.loadDetailFailed')}</p>
            ) : (
              <div className="py-16"><AdminLoading /></div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <AdminCircleEditorForm
      key={circleId ?? 'create'}
      state={state}
      initialSnapshot={isEdit ? detailQuery.data ?? null : null}
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
  const isEdit = state.mode === 'edit';
  const [snapshot] = useState<AdminCircleDetail | null>(() => initialSnapshot);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'NORMAL' | 'OFFICIAL'>('NORMAL');
  const [topicDraft, setTopic] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rulesDraft, setRulesDraft] = useState<Rule[] | null>(null);
  const [editableRuleIds, setEditableRuleIds] = useState<Set<string>>(new Set());
  const topic = topicDraft ?? snapshot?.topic ?? '';
  const originalRules = useMemo(() => snapshot?.rules ?? [], [snapshot?.rules]);
  const rules = rulesDraft ?? originalRules;
  const setRules = (update: Rule[] | ((current: Rule[]) => Rule[])) => {
    setRulesDraft((current) => {
      const base = current ?? originalRules;
      return typeof update === 'function' ? update(base) : update;
    });
  };
  const topicChanged = Boolean(snapshot && topic.trim() !== snapshot.topic);
  const rulesChanged = Boolean(snapshot && !rulesEqual(rules, originalRules));
  const deletedRules = originalRules.filter(
    (original) => !rules.some((rule) => rule.id === original.id),
  );
  const changeSummary = useMemo(() => {
    if (!snapshot) return [];
    const summary: string[] = [];
    if (topicChanged) summary.push(t('admin.circles.changeTopic'));
    const added = rules.filter((rule) => !originalRules.some((original) => original.id === rule.id));
    const edited = rules.filter((rule) => {
      const original = originalRules.find((item) => item.id === rule.id);
      return original && original.text.trim() !== rule.text.trim();
    });
    const moved = rules.filter((rule, index) => {
      const originalIndex = originalRules.findIndex((item) => item.id === rule.id);
      return originalIndex >= 0 && originalIndex !== index;
    });
    if (added.length) summary.push(t('admin.circles.changeAddedRules', { count: added.length }));
    if (edited.length) summary.push(t('admin.circles.changeEditedRules', { count: edited.length }));
    if (deletedRules.length) summary.push(t('admin.circles.changeDeletedRules', { count: deletedRules.length }));
    if (moved.length) summary.push(t('admin.circles.changeMovedRules', { count: moved.length }));
    return summary;
  }, [deletedRules.length, originalRules, rules, snapshot, t, topicChanged]);
  const impactedProposals = snapshot?.activeProposals.filter(
    (proposal) =>
      (proposal.scope === 'TOPIC' && topicChanged) ||
      (proposal.scope === 'RULES' && rulesChanged),
  ) ?? [];

  const mutation = useMutation({
    mutationFn: () => {
      if (!state) throw new Error(t('admin.circles.editorClosed'));
      if (state.mode === 'create') {
        return adminApi.createCircle({
          name: name.trim(),
          topic: topic.trim(),
          kind,
        });
      }
      if (!snapshot) throw new Error(t('admin.circles.loadDetailFailed'));
      return adminApi.updateCircle(snapshot.id ?? snapshot._id, {
        ...(topicChanged
          ? { topic: { value: topic.trim(), expectedVersion: snapshot.topicVersion } }
          : {}),
        ...(rulesChanged
          ? {
              rules: {
                value: normalizeRules(rules),
                expectedVersion: snapshot.rulesVersion,
              },
            }
          : {}),
        reason: reason.trim(),
      });
    },
    onSuccess: onSaved,
  });

  const rulesValid = rules.every((rule) => rule.text.trim().length > 0);
  const valid = isEdit
    ? Boolean(snapshot && (topicChanged || rulesChanged) && reason.trim().length >= 4 && rulesValid)
    : Boolean(name.trim() && topic.trim());

  return (
    <Dialog.Root
      open={Boolean(state)}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[190] bg-void/45 backdrop-blur-[2px]" />
        <Dialog.Content className="skynet-dialog-content fixed left-1/2 top-1/2 z-[200] max-h-[calc(100dvh-32px)] w-[min(calc(100vw-32px),880px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border-default bg-void-deep p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-bold text-ink-primary">
                {t(isEdit ? 'admin.circles.editTitle' : 'admin.circles.createTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                {t(isEdit ? 'admin.circles.editDescription' : 'admin.circles.createDescription')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t('app.close')}
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-6 space-y-7">
              {!isEdit ? (
                <>
                  <label className="block text-xs text-ink-secondary">
                    {t('admin.circles.name')}
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm"
                    />
                  </label>
                  <div>
                    <div className="text-xs text-ink-secondary">{t('admin.circles.kind')}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(['NORMAL', 'OFFICIAL'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setKind(value)}
                          className={`rounded-md border px-3 py-3 text-left transition-colors ${
                            kind === value
                              ? 'border-copper bg-copper/10 text-copper'
                              : 'border-border-subtle text-ink-secondary hover:border-border-accent'
                          }`}
                        >
                          <span className="block text-sm font-bold">{t(`admin.circles.kinds.${value}`)}</span>
                          <span className="mt-1 block text-xs text-ink-muted">
                            {t(`admin.circles.kindDescriptions.${value}`)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              <section>
                <h3 className="text-sm font-bold text-ink-primary">{t('admin.circles.topic')}</h3>
                {isEdit && snapshot ? (
                  <div className="mt-3 space-y-3">
                    <p className="whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2.5 text-sm leading-6 text-ink-muted">
                      {snapshot.topic}
                    </p>
                    <div className={topicChanged ? 'border-l-2 border-copper/60 pl-3' : ''}>
                      {topicChanged ? <div className="mb-2 text-[10px] font-bold text-copper">{t('admin.circles.changed')}</div> : null}
                      <ComposerTextarea
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                        rows={5}
                        variant="framed"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <ComposerTextarea
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      rows={5}
                      variant="framed"
                    />
                  </div>
                )}
              </section>

              {isEdit && snapshot ? (
                <section>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-ink-primary">{t('admin.circles.rules')}</h3>
                      <p className="mt-1 text-xs text-ink-muted">{t('admin.circles.rulesEditHint')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const id = crypto.randomUUID();
                        setRules((items) => [...items, { id, text: '' }]);
                        setEditableRuleIds((items) => new Set(items).add(id));
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-border-subtle px-2 text-xs text-copper"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('admin.circles.addRule')}
                    </button>
                  </div>
                  <div className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
                    {rules.map((rule, index) => {
                      const original = originalRules.find((item) => item.id === rule.id);
                      const originalIndex = originalRules.findIndex((item) => item.id === rule.id);
                      const added = !original;
                      const edited = Boolean(original && original.text.trim() !== rule.text.trim());
                      const moved = originalIndex >= 0 && originalIndex !== index;
                      const editable = added || editableRuleIds.has(rule.id);
                      return (
                        <div key={rule.id} className="py-4">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                                <span className="text-ink-muted">{t('admin.circles.ruleNumber', { number: index + 1 })}</span>
                                {added ? <span className="text-moss">{t('admin.circles.added')}</span> : null}
                                {edited ? <span className="text-copper">{t('admin.circles.edited')}</span> : null}
                                {moved ? <span className="text-steel">{t('admin.circles.moved', { from: originalIndex + 1, to: index + 1 })}</span> : null}
                              </div>
                              {original && editable ? (
                                <p className="mt-2 rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2 text-xs leading-5 text-ink-muted">
                                  {original.text}
                                </p>
                              ) : null}
                              {editable ? (
                                <input
                                  value={rule.text}
                                  onChange={(event) => setRules((items) => items.map((item) => item.id === rule.id ? { ...item, text: event.target.value } : item))}
                                  className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm"
                                />
                              ) : (
                                <p className="mt-2 text-sm leading-6 text-ink-secondary">{rule.text}</p>
                              )}
                            </div>
                            {!editable ? (
                              <SmallIconButton
                                label={t('admin.circles.editRule')}
                                onClick={() => setEditableRuleIds((items) => new Set(items).add(rule.id))}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </SmallIconButton>
                            ) : null}
                            <SmallIconButton label={t('admin.circles.moveUp')} onClick={() => setRules((items) => moveRule(items, index, -1))}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </SmallIconButton>
                            <SmallIconButton label={t('admin.circles.moveDown')} onClick={() => setRules((items) => moveRule(items, index, 1))}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </SmallIconButton>
                            <SmallIconButton warning label={t('admin.circles.removeRule')} onClick={() => setRules((items) => items.filter((item) => item.id !== rule.id))}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </SmallIconButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {deletedRules.length ? (
                    <div className="mt-4 border-l-2 border-ochre/45 pl-3">
                      <div className="text-xs font-bold text-ochre">{t('admin.circles.pendingDeletion')}</div>
                      <div className="mt-2 space-y-2">
                        {deletedRules.map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between gap-3 text-sm text-ink-secondary">
                            <span>{rule.text}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const originalIndex = originalRules.findIndex((item) => item.id === rule.id);
                                setRules((items) => {
                                  const next = [...items];
                                  next.splice(Math.min(originalIndex, next.length), 0, { ...rule });
                                  return next;
                                });
                              }}
                              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-copper"
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
                <section className="border-t border-border-subtle pt-5">
                  <h3 className="text-sm font-bold text-ink-primary">{t('admin.circles.changeSummary')}</h3>
                  {changeSummary.length ? (
                    <ul className="mt-3 space-y-1 text-sm text-ink-secondary">
                      {changeSummary.map((item) => <li key={item}>· {item}</li>)}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-ink-muted">{t('admin.circles.noChanges')}</p>
                  )}
                  {impactedProposals.length ? (
                    <div className="mt-4 border-l-2 border-ochre/45 pl-3">
                      <div className="text-xs font-bold text-ochre">{t('admin.circles.proposalsWillEnd')}</div>
                      <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
                        {impactedProposals.map((proposal) => (
                          <li key={proposal.id} className="space-y-0.5">
                            <div>
                              {t(`circles.coBuild.scopes.${proposal.scope}`)} ·{' '}
                              {t('admin.circles.proposalRevision', {
                                number: proposal.currentRevisionNumber,
                              })} · {t(`circles.coBuild.statuses.${proposal.status}`)}
                            </div>
                            <div className="font-mono text-[10px] text-ink-muted">
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
                <div>
                  <label className="block text-xs font-bold text-ink-secondary">
                    {t('admin.circles.adminReason')}
                  </label>
                  <div className="mt-2">
                    <ComposerTextarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={4}
                      variant="framed"
                    />
                  </div>
                  <p className={`mt-1 text-xs ${reason.trim().length > 0 && reason.trim().length < 4 ? 'text-ochre' : 'text-ink-muted'}`}>
                    {t('admin.circles.adminReasonHint')}
                  </p>
                </div>
              ) : null}
              {mutation.error ? <p className="text-xs text-ochre">{mutation.error.message}</p> : null}
          </div>

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <div className="text-xs text-ink-muted">
              {isEdit && !valid
                ? !topicChanged && !rulesChanged
                  ? t('admin.circles.saveDisabledNoChanges')
                  : reason.trim().length < 4
                    ? t('admin.circles.saveDisabledReason')
                    : t('admin.circles.saveDisabledInvalidRule')
                : ''}
            </div>
            <div className="flex shrink-0 gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-md border border-border-subtle px-4 py-2 text-sm text-ink-secondary">
                  {t('app.cancel')}
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={!valid || mutation.isPending}
                onClick={() => mutation.mutate()}
                className="rounded-md bg-copper px-4 py-2 text-sm font-bold text-void disabled:cursor-not-allowed disabled:opacity-45"
              >
                {mutation.isPending
                  ? t('admin.action.running')
                  : t(isEdit ? 'admin.circles.saveChanges' : 'admin.circles.create')}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
