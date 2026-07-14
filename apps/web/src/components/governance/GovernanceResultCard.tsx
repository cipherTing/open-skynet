'use client';

import { AlertTriangle, CheckCircle2, FileText, MessageSquare, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultFeedItem, GovernanceTargetSummary } from '@skynet/shared';
import { formatGovernanceDuration, getGovernanceResultKey } from './governance-format';

interface GovernanceResultCardProps {
  result: GovernanceResultFeedItem;
  onOpen: (result: GovernanceResultFeedItem, trigger: HTMLButtonElement) => void;
}

function getResultMeta(result: GovernanceResultFeedItem) {
  if (result.result === 'violation') {
    return {
      className: 'governance-result-card--violation',
      icon: AlertTriangle,
      labelClassName: 'governance-verdict-pill governance-verdict-pill--violation',
    };
  }
  return {
    className: 'governance-result-card--not-violation',
    icon: CheckCircle2,
    labelClassName: 'governance-verdict-pill governance-verdict-pill--not-violation',
  };
}

function getSummaryCopy(summary: GovernanceTargetSummary, t: ReturnType<typeof useTranslation>['t']) {
  if (summary.kind === 'POST') {
    return {
      icon: FileText,
      source: t('governance.card.sourcePost'),
      title: summary.post.title,
      content: summary.post.excerpt,
      context: null,
    };
  }
  if (summary.kind === 'CIRCLE_PROPOSAL') {
    return {
      icon: Scale,
      source: t('governance.targetTypes.CIRCLE_PROPOSAL'),
      title: t(`circles.coBuild.scopes.${summary.proposal.scope}`),
      content: summary.proposal.excerpt,
      context: null,
    };
  }
  if (summary.kind === 'CIRCLE_PROPOSAL_COMMENT') {
    return {
      icon: MessageSquare,
      source: t('governance.targetTypes.CIRCLE_PROPOSAL_COMMENT'),
      title: t('governance.targetTypes.CIRCLE_PROPOSAL_COMMENT'),
      content: summary.comment.excerpt,
      context: null,
    };
  }
  return {
    icon: MessageSquare,
    source: summary.depth === 2 ? t('governance.card.sourceNestedReply') : t('governance.card.sourceReply'),
    title: summary.post.title,
    content: summary.reply.excerpt,
    context: summary.parentReply?.excerpt ?? null,
  };
}

function formatTally(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

export function GovernanceResultCard({ result, onOpen }: GovernanceResultCardProps) {
  const { t } = useTranslation();
  const meta = getResultMeta(result);
  const Icon = meta.icon;
  const summary = getSummaryCopy(result.targetSummary, t);
  const TargetIcon = summary.icon;
  const verdictLabel = t(`governance.results.${getGovernanceResultKey(result.result)}`);

  return (
    <button
      type="button"
      className={`governance-result-card governance-result-card-interactive ${meta.className}`}
      onClick={(event) => onOpen(result, event.currentTarget)}
      aria-label={t('governance.detail.openDetails', { verdict: verdictLabel })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
          <TargetIcon className="h-3.5 w-3.5 text-copper" />
          <span>{summary.source}</span>
        </div>
        <span className={meta.labelClassName}>
          <Icon className="h-3.5 w-3.5" />
          {verdictLabel}
        </span>
      </div>

      <div className="mt-2 text-left">
        <h3 className="line-clamp-1 text-[13px] font-bold text-ink-primary">{summary.title}</h3>
        {summary.context ? <p className="governance-card-context">{summary.context}</p> : null}
        <p className="governance-card-content">{summary.content}</p>
      </div>

      <div className="governance-card-inline-meta">
        <span className="text-ochre">{t('governance.metrics.violationVotes')} {formatTally(result.tally.violation)}</span>
        <span className="text-moss">{t('governance.metrics.notViolationVotes')} {formatTally(result.tally.notViolation)}</span>
        <span>{formatGovernanceDuration(result.durationMinutes, '—', t)}</span>
      </div>
    </button>
  );
}
