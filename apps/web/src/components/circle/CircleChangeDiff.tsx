'use client';

import { ArrowRight, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CircleRuleItem } from '@skynet/shared';

type RuleChange =
  | { kind: 'ADDED'; rule: CircleRuleItem; index: number }
  | { kind: 'EDITED'; before: CircleRuleItem; after: CircleRuleItem; index: number }
  | { kind: 'MOVED'; rule: CircleRuleItem; fromIndex: number; toIndex: number }
  | { kind: 'DELETED'; rule: CircleRuleItem; index: number };

function Snapshot({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`border px-3 py-2.5 ${muted ? 'border-[var(--t-noise2)] bg-black text-[var(--t-text)]/40' : 'border-[var(--t-noise)] bg-[var(--t-panel)] text-[var(--t-text)]'}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--t-faint)]">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</p>
    </div>
  );
}

export function TopicChangeDiff({ before, after }: { before: string | null; after: string | null }) {
  const { t } = useTranslation();
  if (before === null || after === null) {
    return <p className="border border-dashed border-[var(--t-noise)] px-3 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">{t('circles.coBuild.diff.historyUnavailable')}</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <Snapshot label={t('circles.coBuild.diff.before')} value={before} muted />
      <ArrowRight className="mx-auto h-4 w-4 text-[var(--t-accent)]" />
      <Snapshot label={t('circles.coBuild.diff.after')} value={after} />
    </div>
  );
}

function findRuleChanges(before: CircleRuleItem[], after: CircleRuleItem[]): RuleChange[] {
  const beforeById = new Map(before.map((rule, index) => [rule.id, { rule, index }]));
  const afterById = new Map(after.map((rule, index) => [rule.id, { rule, index }]));
  const commonBeforeIds = before.filter((rule) => afterById.has(rule.id)).map((rule) => rule.id);
  const commonAfterIds = after.filter((rule) => beforeById.has(rule.id)).map((rule) => rule.id);
  const commonBeforeIndexes = new Map(commonBeforeIds.map((id, index) => [id, index]));
  const commonAfterIndexes = new Map(commonAfterIds.map((id, index) => [id, index]));
  const afterIds = new Set(after.map((rule) => rule.id));
  const changes: RuleChange[] = [];

  after.forEach((rule, index) => {
    const previous = beforeById.get(rule.id);
    if (!previous) {
      changes.push({ kind: 'ADDED', rule, index });
      return;
    }
    if (previous.rule.text !== rule.text) {
      changes.push({ kind: 'EDITED', before: previous.rule, after: rule, index });
    }
    if (commonBeforeIndexes.get(rule.id) !== commonAfterIndexes.get(rule.id)) {
      changes.push({ kind: 'MOVED', rule, fromIndex: previous.index, toIndex: index });
    }
  });

  before.forEach((rule, index) => {
    if (!afterIds.has(rule.id)) changes.push({ kind: 'DELETED', rule, index });
  });

  return changes;
}

function ChangeBadge({ kind }: { kind: RuleChange['kind'] }) {
  const { t } = useTranslation();
  const config = {
    ADDED: { icon: Plus, className: 'border-[var(--t-accent)]/50 bg-[var(--t-accent)]/10 text-[var(--t-accent)]', key: 'added' },
    EDITED: { icon: Pencil, className: 'border-[var(--t-noise)] bg-[var(--t-noise)]/40 text-[var(--t-text)]', key: 'edited' },
    MOVED: { icon: RotateCcw, className: 'border-[var(--t-noise)] bg-black text-[var(--t-faint)]', key: 'moved' },
    DELETED: { icon: Trash2, className: 'border-[var(--t-hazard-dim)] bg-[var(--t-hazard-dim)]/20 text-[var(--t-hazard)]/80', key: 'deleted' },
  } as const;
  const current = config[kind];
  const Icon = current.icon;
  return <span className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] ${current.className}`}><Icon className="h-3 w-3" />{t(`circles.coBuild.diff.${current.key}`)}</span>;
}

export function RuleChangeDiff({ before, after }: { before: CircleRuleItem[] | null; after: CircleRuleItem[] | null }) {
  const { t } = useTranslation();
  if (before === null || after === null) {
    return <p className="border border-dashed border-[var(--t-noise)] px-3 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">{t('circles.coBuild.diff.historyUnavailable')}</p>;
  }
  const changes = findRuleChanges(before, after);
  if (changes.length === 0) return <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">{t('circles.coBuild.diff.unchanged')}</p>;
  return (
    <ol className="space-y-3">
      {changes.map((change) => (
        <li key={`${change.kind}-${change.kind === 'EDITED' ? change.after.id : change.rule.id}`} className="border border-[var(--t-noise)] bg-black p-3">
          <div className="flex items-center justify-between gap-3"><ChangeBadge kind={change.kind} />{change.kind !== 'DELETED' ? <span className="font-mono text-[10px] tabular-nums text-[var(--t-faint)]">#{String((change.kind === 'MOVED' ? change.toIndex : change.index) + 1).padStart(2, '0')}</span> : null}</div>
          {change.kind === 'EDITED' ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><Snapshot label={t('circles.coBuild.diff.before')} value={change.before.text} muted /><Snapshot label={t('circles.coBuild.diff.after')} value={change.after.text} /></div> : null}
          {change.kind === 'ADDED' ? <p className="mt-3 text-sm leading-6 text-[var(--t-text)]">{change.rule.text}</p> : null}
          {change.kind === 'DELETED' ? <p className="mt-3 text-sm leading-6 text-[var(--t-text)]/40 line-through">{change.rule.text}</p> : null}
          {change.kind === 'MOVED' ? <p className="mt-3 text-sm leading-6 text-[var(--t-text)]/70">{change.rule.text}<span className="ml-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)]">{t('circles.coBuild.diff.movedFrom', { from: change.fromIndex + 1, to: change.toIndex + 1 })}</span></p> : null}
        </li>
      ))}
    </ol>
  );
}
