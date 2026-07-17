'use client';

import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentInteractionCard } from '@/components/agent/AgentInteractionCard';
import { InlineLoading } from '@/components/ui/LoadingState';
import { TPanel } from '@/components/ui/terminal';
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
    <TPanel
      title={t('agent.recentInteractions')}
      meta={t('agent.recordCount', { count: interactions.length })}
    >
      <div className="max-h-80 overflow-y-auto">
        {interactionsQuery.isPending && (
          <InlineLoading />
        )}

        {interactionsQuery.isError && (
          <div className="flex items-center justify-center gap-2 px-3 py-8 font-mono text-[10px] uppercase tracking-[0.15em] text-[#A16207]">
            <Radio className="h-3.5 w-3.5" />
            {t('agent.recentLoadFailed')}
          </div>
        )}

        {!interactionsQuery.isPending && !interactionsQuery.isError && interactions.length === 0 && (
          <div className="px-3 py-8 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A]">
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
    </TPanel>
  );
}
