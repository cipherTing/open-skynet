'use client';

import { FileText, MessageSquare, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GovernanceResultFeedItem, GovernanceTargetSummary } from '@skynet/shared';
import { Timecode } from '@/components/ui/terminal/Timecode';
import { formatGovernanceDuration, getGovernanceResultKey } from './governance-format';
import {
  GovernanceAlertRail,
  GovernanceVerdictStamp,
  GovernanceVoteCompare,
} from './GovernanceTerminal';

interface GovernanceResultCardProps {
  result: GovernanceResultFeedItem;
  onOpen: (result: GovernanceResultFeedItem, trigger: HTMLButtonElement) => void;
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

/**
 * 裁决档案行：左 2px 分级色条 + 时间码帧列 + 标题/摘要主档 + 右侧判定区（状态印章 + 双通道票条）。
 * 行式记录，禁止卡片化堆叠；信息分层靠 1px 分隔与字重。
 */
export function GovernanceResultCard({ result, onOpen }: GovernanceResultCardProps) {
  const { t } = useTranslation();
  const summary = getSummaryCopy(result.targetSummary, t);
  const TargetIcon = summary.icon;
  const verdictLabel = t(`governance.results.${getGovernanceResultKey(result.result)}`);
  const isAdmin = result.resolutionSource === 'ADMIN';

  return (
    <button
      type="button"
      className="group relative block w-full text-left transition-colors duration-100 [transition-timing-function:steps(2,end)] hover:bg-[#040704] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#ADFF2F]"
      onClick={(event) => onOpen(result, event.currentTarget)}
      aria-label={t('governance.detail.openDetails', { verdict: verdictLabel })}
    >
      <GovernanceAlertRail tone={isAdmin ? 'admin' : 'closed'} />
      <div className="flex flex-col gap-3 py-3 pl-5 pr-3 md:flex-row md:items-start md:gap-4">
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 md:w-[104px] md:flex-col md:items-start md:pt-0.5">
          <Timecode
            date={result.openedAt}
            withDate
            className="transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-[#ADFF2F]"
          />
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[#3A5A3A]">
            <TargetIcon className="h-3 w-3" />
            {summary.source}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-[13px] font-bold text-white/90 transition-colors duration-100 [transition-timing-function:steps(2,end)] group-hover:text-white">
            {summary.title}
          </h3>
          {summary.context ? (
            <p className="mt-1 line-clamp-1 border-l border-[#1A2E1A] pl-2 text-[11px] leading-relaxed text-[#3A5A3A]">
              {summary.context}
            </p>
          ) : null}
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#EDF3ED]/55 [overflow-wrap:anywhere]">
            {summary.content}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] tabular-nums tracking-[0.12em] text-[#3A5A3A]">
            <span>
              {t('governance.detail.duration')} {formatGovernanceDuration(result.durationMinutes, '—', t)}
            </span>
            {isAdmin ? (
              <span className="text-[#EF4444]/80">{t('governance.detail.adminDecision')}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-center justify-between gap-3 md:w-[188px] md:flex-col md:items-stretch md:justify-start">
          <GovernanceVerdictStamp
            tone={result.result === 'violation' ? 'violation' : 'notViolation'}
            label={verdictLabel}
            animate={false}
            className="shrink-0 self-start"
          />
          <GovernanceVoteCompare
            className="w-[168px] md:w-full"
            violation={result.tally.violation}
            notViolation={result.tally.notViolation}
            violationLabel={t('governance.metrics.violationVotes')}
            notViolationLabel={t('governance.metrics.notViolationVotes')}
          />
        </div>
      </div>
    </button>
  );
}
