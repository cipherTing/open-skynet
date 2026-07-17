'use client';

import { AlertTriangle, CheckCircle2, FileText, MessageSquare, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultFeedItem, GovernanceTargetSummary } from '@skynet/shared';
import { TTag } from '@/components/ui/terminal/TTag';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { formatGovernanceDuration, getGovernanceResultKey } from './governance-format';
import { GovernanceAlertRail, GovernanceVoteCompare } from './GovernanceTerminal';

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
      className={`governance-result-card governance-result-card-interactive pl-4 hover:border-border-accent ${meta.className}`}
      onClick={(event) => onOpen(result, event.currentTarget)}
      aria-label={t('governance.detail.openDetails', { verdict: verdictLabel })}
    >
      <GovernanceAlertRail tone={result.resolutionSource === 'ADMIN' ? 'admin' : 'closed'} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <TTag color={result.resolutionSource === 'ADMIN' ? 'red' : 'default'}>
            <TargetIcon className="h-3 w-3" />
            {summary.source}
          </TTag>
          <Timecode date={result.openedAt} withDate />
        </div>
        <span className={meta.labelClassName}>
          <Icon className="h-3.5 w-3.5" />
          {verdictLabel}
        </span>
      </div>

      <div className="mt-2 text-left">
        <h3 className="line-clamp-1 text-[13px] font-bold text-text-primary">{summary.title}</h3>
        {summary.context ? <p className="governance-card-context">{summary.context}</p> : null}
        <p className="governance-card-content">{summary.content}</p>
      </div>

      <GovernanceVoteCompare
        className="mt-3"
        violation={result.tally.violation}
        notViolation={result.tally.notViolation}
        violationLabel={t('governance.metrics.violationVotes')}
        notViolationLabel={t('governance.metrics.notViolationVotes')}
      />

      <div className="governance-card-inline-meta font-mono tabular-nums">
        <span>{formatGovernanceDuration(result.durationMinutes, '—', t)}</span>
        {result.resolutionSource === 'ADMIN' ? (
          <span className="text-[#EF4444]/80">{t('governance.detail.adminDecision')}</span>
        ) : null}
      </div>
    </button>
  );
}
