'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type { Circle, CircleProposalDetail, CircleProposalScope, CircleRuleItem } from '@skynet/shared';
import { circleApi } from '@/lib/api';
import { useToast } from '@/components/ui/SignalToast';
import { CoBuildMarkdownComposer } from './CoBuildMarkdownComposer';
import { TopicChangeDiff } from './CircleChangeDiff';

interface CreateCircleProposalModalProps {
  circle: Circle;
  proposal?: CircleProposalDetail;
  onClose: () => void;
  onCreated: (proposal: CircleProposalDetail) => Promise<void>;
}

export function CreateCircleProposalModal({ circle, proposal, onClose, onCreated }: CreateCircleProposalModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const currentRevision = proposal?.revisions.at(-1);
  const [scope, setScope] = useState<CircleProposalScope>(proposal?.scope ?? 'TOPIC');
  const [topic, setTopic] = useState(currentRevision?.topic ?? circle.topic);
  const [rules, setRules] = useState<CircleRuleItem[]>(currentRevision?.rules?.map((rule) => ({ ...rule })) ?? circle.rules.map((rule) => ({ ...rule })));
  const [removedRules, setRemovedRules] = useState<CircleRuleItem[]>(() =>
    circle.rules.filter((rule) => !currentRevision?.rules?.some((item) => item.id === rule.id)),
  );
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => proposal
      ? circleApi.reviseProposal(circle.id, proposal.id, {
          expectedVersion: proposal.version,
          reason: reason.trim(),
          ...(scope === 'TOPIC' ? { topic: topic.trim() } : { rules }),
        }, crypto.randomUUID())
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
    onError: () => toast.error(t(proposal ? 'circles.coBuild.reviseFailed' : 'circles.coBuild.createFailed')),
  });
  const unchanged = scope === 'TOPIC'
    ? topic.trim() === circle.topic
    : JSON.stringify(rules) === JSON.stringify(circle.rules);
  const invalidRules = rules.some((rule) => !rule.text.trim());
  const disabled = mutation.isPending || !reason.trim() || unchanged || invalidRules;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border-accent bg-void-deep shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-deck-normal text-copper">{t('circles.coBuild.title')}</p>
            <h2 className="mt-1 text-base font-bold text-ink-primary">{t(proposal ? 'circles.coBuild.reviseTitle' : 'circles.coBuild.createTitle')}</h2>
          </div>
          <button type="button" aria-label={t('app.close')} onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="skynet-auto-hide-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 rounded-md border border-border-subtle bg-void p-1">
            {(['TOPIC', 'RULES'] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={Boolean(proposal)}
                onClick={() => setScope(value)}
                className={`h-9 rounded text-xs font-bold transition-colors disabled:cursor-default ${scope === value ? 'bg-surface-2 text-copper' : 'text-ink-muted hover:text-ink-secondary'}`}
              >
                {t(`circles.coBuild.scopes.${value}`)}
              </button>
            ))}
          </div>

          {scope === 'TOPIC' ? (
            <div className="space-y-3">
              <div><p className="text-xs font-semibold text-ink-secondary">{t('circles.coBuild.currentTopic')}</p><p className="mt-2 rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2.5 text-sm leading-6 text-ink-muted">{circle.topic}</p></div>
              <label className="block text-xs font-semibold text-ink-secondary">{t('circles.coBuild.changeTo')}<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={160} className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm" /></label>
              <TopicChangeDiff before={circle.topic} after={topic.trim() || null} />
            </div>
          ) : (
            <RuleEditor baseRules={circle.rules} rules={rules} removedRules={removedRules} onChange={setRules} onRemovedChange={setRemovedRules} />
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
          {mutation.isError ? <p className="text-xs text-ochre">{t(proposal ? 'circles.coBuild.reviseFailed' : 'circles.coBuild.createFailed')}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border-subtle px-4 text-xs font-semibold text-ink-secondary">{t('circles.coBuild.cancel')}</button>
          <button type="button" disabled={disabled} onClick={() => mutation.mutate()} className="inline-flex h-9 items-center gap-2 rounded-md bg-copper px-4 text-xs font-bold text-void disabled:opacity-40">
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t(proposal ? 'circles.coBuild.revise' : 'circles.coBuild.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleEditor({ baseRules, rules, removedRules, onChange, onRemovedChange }: { baseRules: CircleRuleItem[]; rules: CircleRuleItem[]; removedRules: CircleRuleItem[]; onChange: (rules: CircleRuleItem[]) => void; onRemovedChange: (rules: CircleRuleItem[]) => void }) {
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
  const stopEdit = (id: string) => setEditingIds((items) => { const next = new Set(items); next.delete(id); return next; });
  const remove = (rule: CircleRuleItem) => {
    const original = originalById.get(rule.id);
    onChange(rules.filter((item) => item.id !== rule.id));
    if (original) onRemovedChange([...removedRules.filter((item) => item.id !== rule.id), original]);
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
        <p className="text-xs font-semibold text-ink-secondary">{t('circles.coBuild.currentRules')}</p>
        <button type="button" disabled={rules.length >= 10} onClick={() => { const id = crypto.randomUUID(); onChange([...rules, { id, text: '' }]); beginEdit(id); }} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-2.5 text-xs font-semibold text-copper disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" />{t('circles.coBuild.addRule')}
        </button>
      </div>
      <div className="space-y-2">
        {rules.length === 0 ? <p className="rounded-md border border-dashed border-border-subtle px-3 py-5 text-center text-xs text-ink-muted">{t('circles.coBuild.noProposedRules')}</p> : null}
        {rules.map((rule, index) => (
          <div key={rule.id} className="rounded-md border border-border-subtle bg-void/30 p-3">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="w-5 text-center font-mono text-xs text-ink-muted">{index + 1}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${originalById.has(rule.id) ? 'border-border-subtle text-ink-muted' : 'border-moss/30 bg-moss/10 text-moss'}`}>{t(originalById.has(rule.id) ? 'circles.coBuild.ruleExisting' : 'circles.coBuild.ruleAdded')}</span></div><div className="flex items-center gap-1"><button type="button" title={t('circles.coBuild.moveUp')} onClick={() => move(index, -1)} disabled={index === 0} className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-ink-muted hover:text-ink-primary disabled:opacity-35"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" title={t('circles.coBuild.moveDown')} onClick={() => move(index, 1)} disabled={index === rules.length - 1} className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-ink-muted hover:text-ink-primary disabled:opacity-35"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" title={t('circles.coBuild.editRule')} onClick={() => beginEdit(rule.id)} className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-steel hover:bg-steel/10"><Pencil className="h-3.5 w-3.5" /></button><button type="button" title={t('circles.coBuild.removeRule')} onClick={() => remove(rule)} className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-ochre hover:bg-ochre/10"><Trash2 className="h-3.5 w-3.5" /></button></div></div>
            {editingIds.has(rule.id) ? <div className="mt-3 space-y-2">{originalById.has(rule.id) ? <p className="rounded-md border border-border-subtle bg-surface-1/40 px-3 py-2 text-sm text-ink-muted">{t('circles.coBuild.originalRule')}：{originalById.get(rule.id)?.text}</p> : <p className="text-xs font-semibold text-moss">{t('circles.coBuild.newRule')}</p>}<label className="block text-xs font-semibold text-ink-secondary">{originalById.has(rule.id) ? t('circles.coBuild.changeTo') : t('circles.coBuild.ruleContent')}<input autoFocus value={rule.text} maxLength={280} onChange={(event) => onChange(rules.map((item) => item.id === rule.id ? { ...item, text: event.target.value } : item))} className="skynet-input mt-2 w-full rounded-md px-3 py-2 text-sm" /></label><button type="button" onClick={() => stopEdit(rule.id)} className="text-xs font-semibold text-copper">{t('circles.coBuild.finishEditing')}</button></div> : <p className="mt-3 text-sm leading-6 text-ink-primary">{rule.text}</p>}
          </div>
        ))}
        {removedRules.map((rule) => <div key={rule.id} className="rounded-md border border-ochre/25 bg-ochre/5 p-3"><div className="flex items-center justify-between gap-3"><span className="rounded-full border border-ochre/30 bg-ochre/10 px-2 py-0.5 text-[10px] font-bold text-ochre">{t('circles.coBuild.ruleDeleted')}</span><button type="button" onClick={() => restore(rule)} className="text-xs font-semibold text-copper">{t('circles.coBuild.restoreRule')}</button></div><p className="mt-3 text-sm leading-6 text-ink-muted line-through">{rule.text}</p></div>)}
      </div>
    </div>
  );
}
