'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type {
  Circle,
  CircleProposalDetail,
  CircleProposalScope,
  CircleRuleItem,
} from '@skynet/shared';
import { circleApi } from '@/lib/api';
import { useToast } from '@/components/ui/SignalToast';
import { TerminalDialog } from '@/components/ui/TerminalDialog';
import { TButton, TInput, TRadarNode } from '@/components/ui/terminal';
import { CoBuildMarkdownComposer } from './CoBuildMarkdownComposer';
import { TopicChangeDiff } from './CircleChangeDiff';

interface CreateCircleProposalModalProps {
  circle: Circle;
  proposal?: CircleProposalDetail;
  onClose: () => void;
  onCreated: (proposal: CircleProposalDetail) => Promise<void>;
}

export function CreateCircleProposalModal({
  circle,
  proposal,
  onClose,
  onCreated,
}: CreateCircleProposalModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const currentRevision = proposal?.revisions.at(-1);
  const [scope, setScope] = useState<CircleProposalScope>(proposal?.scope ?? 'TOPIC');
  const [topic, setTopic] = useState(currentRevision?.topic ?? circle.topic);
  const [rules, setRules] = useState<CircleRuleItem[]>(
    currentRevision?.rules?.map((rule) => ({ ...rule })) ??
      circle.rules.map((rule) => ({ ...rule })),
  );
  const [removedRules, setRemovedRules] = useState<CircleRuleItem[]>(() =>
    circle.rules.filter((rule) => !currentRevision?.rules?.some((item) => item.id === rule.id)),
  );
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      proposal
        ? circleApi.reviseProposal(
            circle.id,
            proposal.id,
            {
              expectedVersion: proposal.version,
              reason: reason.trim(),
              ...(scope === 'TOPIC' ? { topic: topic.trim() } : { rules }),
            },
            crypto.randomUUID(),
          )
        : circleApi.createProposal(
            circle.id,
            {
              scope,
              expectedVersion: scope === 'TOPIC' ? circle.topicVersion : circle.rulesVersion,
              reason: reason.trim(),
              ...(scope === 'TOPIC' ? { topic: topic.trim() } : { rules }),
            },
            crypto.randomUUID(),
          ),
    onSuccess: async (proposal) => {
      toast.success(t(proposal ? 'circles.coBuild.revised' : 'circles.coBuild.created'));
      await onCreated(proposal);
      onClose();
    },
    onError: () =>
      toast.error(t(proposal ? 'circles.coBuild.reviseFailed' : 'circles.coBuild.createFailed')),
  });
  const unchanged =
    scope === 'TOPIC'
      ? topic.trim() === circle.topic
      : JSON.stringify(rules) === JSON.stringify(circle.rules);
  const invalidRules = rules.some((rule) => !rule.text.trim());
  const disabled = mutation.isPending || !reason.trim() || unchanged || invalidRules;

  return (
    <TerminalDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(proposal ? 'circles.coBuild.reviseTitle' : 'circles.coBuild.createTitle')}
      code="CIRCLE.PROPOSAL"
      size="lg"
      footer={
        <>
          <TButton variant="secondary" onClick={onClose}>
            {t('circles.coBuild.cancel')}
          </TButton>
          <TButton variant="primary" disabled={disabled} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t(proposal ? 'circles.coBuild.revise' : 'circles.coBuild.submit')}
          </TButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-8 border border-[var(--t-noise)] bg-black px-4 py-3">
          {(['TOPIC', 'RULES'] as const).map((value) => (
            <TRadarNode
              key={value}
              checked={scope === value}
              disabled={Boolean(proposal)}
              onChange={() => setScope(value)}
              label={t(`circles.coBuild.scopes.${value}`)}
            />
          ))}
        </div>

        {scope === 'TOPIC' ? (
          <div className="space-y-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                {t('circles.coBuild.currentTopic')}
              </p>
              <p className="mt-2 border border-[var(--t-noise)] bg-black px-3 py-2.5 text-sm leading-6 text-[var(--t-text)]/50">
                {circle.topic}
              </p>
            </div>
            <label className="block font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
              {t('circles.coBuild.changeTo')}
              <TInput
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                maxLength={160}
                className="mt-2"
              />
            </label>
            <TopicChangeDiff before={circle.topic} after={topic.trim() || null} />
          </div>
        ) : (
          <RuleEditor
            baseRules={circle.rules}
            rules={rules}
            removedRules={removedRules}
            onChange={setRules}
            onRemovedChange={setRemovedRules}
          />
        )}

        <CoBuildMarkdownComposer
          value={reason}
          onChange={setReason}
          label={t('circles.coBuild.reason')}
          placeholder={t('circles.coBuild.reasonPlaceholder')}
          editLabel={t('circles.coBuild.edit')}
          previewLabel={t('circles.coBuild.preview')}
          emptyPreview={t('circles.coBuild.emptyPreview')}
        />
        {mutation.isError ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-hazard)]/80">
            {t(proposal ? 'circles.coBuild.reviseFailed' : 'circles.coBuild.createFailed')}
          </p>
        ) : null}
      </div>
    </TerminalDialog>
  );
}

function RuleEditor({
  baseRules,
  rules,
  removedRules,
  onChange,
  onRemovedChange,
}: {
  baseRules: CircleRuleItem[];
  rules: CircleRuleItem[];
  removedRules: CircleRuleItem[];
  onChange: (rules: CircleRuleItem[]) => void;
  onRemovedChange: (rules: CircleRuleItem[]) => void;
}) {
  const { t } = useTranslation();
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const originalById = new Map(baseRules.map((rule) => [rule.id, rule]));
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
    const original = originalById.get(rule.id);
    onChange(rules.filter((item) => item.id !== rule.id));
    if (original)
      onRemovedChange([...removedRules.filter((item) => item.id !== rule.id), original]);
  };
  const restore = (rule: CircleRuleItem) => {
    const originalIndex = baseRules.findIndex((item) => item.id === rule.id);
    const next = [...rules];
    next.splice(Math.min(Math.max(originalIndex, 0), next.length), 0, rule);
    onChange(next);
    onRemovedChange(removedRules.filter((item) => item.id !== rule.id));
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
          {t('circles.coBuild.currentRules')}
        </p>
        <TButton
          variant="secondary"
          size="sm"
          disabled={rules.length >= 10}
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
          <p className="border border-dashed border-[var(--t-noise)] px-3 py-5 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
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
                  className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] ${
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
                  <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-accent)]">
                    {t('circles.coBuild.newRule')}
                  </p>
                )}
                <label className="block font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-faint)]">
                  {originalById.has(rule.id)
                    ? t('circles.coBuild.changeTo')
                    : t('circles.coBuild.ruleContent')}
                  <TInput
                    autoFocus
                    value={rule.text}
                    maxLength={280}
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
                  className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
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
          <div key={rule.id} className="border border-[var(--t-hazard-dim)] bg-[var(--t-hazard-dim)]/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="border border-[var(--t-hazard-dim)] bg-[var(--t-hazard-dim)]/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-hazard)]/80">
                {t('circles.coBuild.ruleDeleted')}
              </span>
              <button
                type="button"
                onClick={() => restore(rule)}
                className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--t-accent)] transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:text-white"
              >
                {t('circles.coBuild.restoreRule')}
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--t-text)]/40 line-through">{rule.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
