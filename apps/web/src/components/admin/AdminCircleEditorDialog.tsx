'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ComposerTextarea } from '@/components/ui/ComposerTextarea';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TInput } from '@/components/ui/terminal';
import { adminApi, type AdminCircleDetail, type AdminCircleItem } from '@/lib/admin-api';
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
          ? 'border-[#7F1D1D] text-[#EF4444] hover:bg-[#7F1D1D]/20'
          : 'border-[#1A2E1A] text-[#3A5A3A] hover:border-[#3A5A3A] hover:text-[#ADFF2F]'
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
  const editorKey = state.mode === 'create' ? 'create' : `edit:${itemId(state.circle!)}`;
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
      <TerminalDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={t('admin.circles.editTitle')}
        code="ADMIN.CIRCLE"
        size="md"
        contentClassName="t-corner"
      >
        {detailQuery.isError ? (
          <p className="text-sm text-[#EF4444]">{t('admin.circles.loadDetailFailed')}</p>
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
    const added = rules.filter(
      (rule) => !originalRules.some((original) => original.id === rule.id),
    );
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
    if (deletedRules.length)
      summary.push(t('admin.circles.changeDeletedRules', { count: deletedRules.length }));
    if (moved.length) summary.push(t('admin.circles.changeMovedRules', { count: moved.length }));
    return summary;
  }, [deletedRules.length, originalRules, rules, snapshot, t, topicChanged]);
  const impactedProposals =
    snapshot?.activeProposals.filter(
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
    <TerminalDialog
      open={Boolean(state)}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title={t(isEdit ? 'admin.circles.editTitle' : 'admin.circles.createTitle')}
      code="ADMIN.CIRCLE"
      size="xl"
      contentClassName="t-corner"
      footer={
        <>
          <span className="mr-auto text-xs text-[#3A5A3A]">
            {isEdit && !valid
              ? !topicChanged && !rulesChanged
                ? t('admin.circles.saveDisabledNoChanges')
                : reason.trim().length < 4
                  ? t('admin.circles.saveDisabledReason')
                  : t('admin.circles.saveDisabledInvalidRule')
              : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!mutation.isPending) onClose();
            }}
            className="t-btn t-btn--ghost"
          >
            {t('app.cancel')}
          </button>
          <button
            type="button"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="t-btn t-btn--primary"
          >
            {mutation.isPending
              ? t('admin.action.running')
              : t(isEdit ? 'admin.circles.saveChanges' : 'admin.circles.create')}
          </button>
        </>
      }
    >
      <p className="text-xs text-[#3A5A3A]">
        {t(isEdit ? 'admin.circles.editDescription' : 'admin.circles.createDescription')}
      </p>
      <div className="mt-6 space-y-7">
        {!isEdit ? (
          <>
            <label className="block text-xs text-white/60">
              {t('admin.circles.name')}
              <TInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2"
              />
            </label>
            <div>
              <div className="text-xs text-white/60">{t('admin.circles.kind')}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['NORMAL', 'OFFICIAL'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    className={`rounded-none border px-3 py-3 text-left transition-colors duration-100 [transition-timing-function:steps(2,end)] ${
                      kind === value
                        ? 'border-[#ADFF2F] bg-[#ADFF2F]/10 text-[#ADFF2F]'
                        : 'border-[#1A2E1A] text-white/60 hover:border-[#3A5A3A]'
                    }`}
                  >
                    <span className="block text-sm font-bold">
                      {t(`admin.circles.kinds.${value}`)}
                    </span>
                    <span className="mt-1 block text-xs text-[#3A5A3A]">
                      {t(`admin.circles.kindDescriptions.${value}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <section>
          <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
            <span aria-hidden className="text-[#ADFF2F]">
              {'//'}
            </span>
            {t('admin.circles.topic')}
          </h3>
          {isEdit && snapshot ? (
            <div className="mt-3 space-y-3">
              <p className="whitespace-pre-wrap border border-[#1A2E1A] bg-[#040704] px-3 py-2.5 text-sm leading-6 text-[#3A5A3A]">
                {snapshot.topic}
              </p>
              <div className={topicChanged ? 'border-l-2 border-[#ADFF2F]/60 pl-3' : ''}>
                {topicChanged ? (
                  <div className="mb-2 text-[10px] font-bold text-[#ADFF2F]">
                    {t('admin.circles.changed')}
                  </div>
                ) : null}
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
                <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
                  <span aria-hidden className="text-[#ADFF2F]">
                    {'//'}
                  </span>
                  {t('admin.circles.rules')}
                </h3>
                <p className="mt-1 text-xs text-[#3A5A3A]">
                  {t('admin.circles.rulesEditHint')}
                </p>
              </div>
              <TButton
                type="button"
                size="sm"
                variant="secondary"
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
            <div className="mt-4 divide-y divide-[#1A2E1A] border-y border-[#1A2E1A]">
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
                          <span className="text-[#3A5A3A]">
                            {t('admin.circles.ruleNumber', { number: index + 1 })}
                          </span>
                          {added ? (
                            <span className="text-[#ADFF2F]">{t('admin.circles.added')}</span>
                          ) : null}
                          {edited ? (
                            <span className="text-[#ADFF2F]">{t('admin.circles.edited')}</span>
                          ) : null}
                          {moved ? (
                            <span className="text-[#3A5A3A]">
                              {t('admin.circles.moved', { from: originalIndex + 1, to: index + 1 })}
                            </span>
                          ) : null}
                        </div>
                        {original && editable ? (
                          <p className="mt-2 border border-[#1A2E1A] bg-[#040704] px-3 py-2 text-xs leading-5 text-[#3A5A3A]">
                            {original.text}
                          </p>
                        ) : null}
                        {editable ? (
                          <TInput
                            value={rule.text}
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
                          <p className="mt-2 text-sm leading-6 text-white/60">{rule.text}</p>
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
              <div className="mt-4 border-l-2 border-[#7F1D1D] pl-3">
                <div className="text-xs font-bold text-[#EF4444]">
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
                            next.splice(Math.min(originalIndex, next.length), 0, { ...rule });
                            return next;
                          });
                        }}
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#ADFF2F]"
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
          <section className="border-t border-[#1A2E1A] pt-5">
            <h3 className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-[#EDF3ED]">
              <span aria-hidden className="text-[#ADFF2F]">
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
              <p className="mt-2 text-sm text-[#3A5A3A]">{t('admin.circles.noChanges')}</p>
            )}
            {impactedProposals.length ? (
              <div className="mt-4 border-l-2 border-[#7F1D1D] pl-3">
                <div className="text-xs font-bold text-[#EF4444]">
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
                      <div className="font-mono text-[10px] text-[#3A5A3A]">
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
            <label className="block text-xs font-bold text-white/60">
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
            <p
              className={`mt-1 text-xs ${reason.trim().length > 0 && reason.trim().length < 4 ? 'text-[#EF4444]' : 'text-[#3A5A3A]'}`}
            >
              {t('admin.circles.adminReasonHint')}
            </p>
          </div>
        ) : null}
        {mutation.error ? <p className="text-xs text-[#EF4444]">{mutation.error.message}</p> : null}
      </div>
    </TerminalDialog>
  );
}
