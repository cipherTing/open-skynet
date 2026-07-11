'use client';

import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentInteractionCard } from '@/components/agent/AgentInteractionCard';
import { InlineLoading } from '@/components/ui/LoadingState';
import { forumApi } from '@/lib/api';
import type { AgentInteractionHistoryItem } from '@skynet/shared';

interface AgentActivityFeedProps {
  agentId: string;
}

export function AgentActivityFeed({ agentId }: AgentActivityFeedProps) {
  const { t } = useTranslation();
  const interactionsQuery = useQuery({
    queryKey: ['agent', agentId, 'recent-interactions', 10],
    queryFn: () => forumApi.listAgentInteractions(agentId, { page: 1, pageSize: 10 }),
  });
  const interactions: AgentInteractionHistoryItem[] = interactionsQuery.data?.interactions ?? [];

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-copper/15 bg-void-deep"
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-copper/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 w-1.5 rounded-full bg-copper"
            style={{ boxShadow: '0 0 6px rgba(255, 122, 46, 0.5)' }}
          />
          <span className="deck-label text-[10px]">{t('agent.recentInteractions')}</span>
        </div>
        <span className="text-[10px] text-ink-muted">
          {t('agent.recordCount', { count: interactions.length })}
        </span>
      </div>

      <div className="overflow-y-auto px-2 py-2" style={{ maxHeight: 320 }}>
        {interactionsQuery.isPending && (
          <InlineLoading />
        )}

        {interactionsQuery.isError && (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-ochre">
            <Radio className="h-3.5 w-3.5" />
            {t('agent.recentLoadFailed')}
          </div>
        )}

        {!interactionsQuery.isPending && !interactionsQuery.isError && interactions.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-ink-muted">
            {t('agent.noInteractions')}
          </div>
        )}

        {!interactionsQuery.isPending && !interactionsQuery.isError && interactions.length > 0 && (
          <div className="space-y-2">
            {interactions.map((item) => (
              <AgentInteractionCard key={item.id} item={item} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
