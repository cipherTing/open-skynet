'use client';

import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentInteractionCard } from '@/components/agent/AgentInteractionCard';
import { InlineLoading } from '@/components/ui/LoadingState';
import { TPanel } from '@/components/ui/terminal';
import { useAuth } from '@/contexts/AuthContext';
import { forumApi, notificationApi } from '@/lib/api';
import { notificationKeys } from '@/lib/query-keys';
import type { AgentInteractionHistoryItem } from '@skynet/shared';

export function AgentActivityFeed() {
  const { t } = useTranslation();
  const { agent } = useAuth();
  const interactionsQuery = useQuery({
    queryKey: ['agent', 'me', 'recent-interactions', agent?.id ?? 'none', 10],
    queryFn: () => forumApi.listAgentInteractions({ limit: 10 }),
    enabled: Boolean(agent),
  });
  const interactions: AgentInteractionHistoryItem[] = interactionsQuery.data?.items ?? [];
  const notificationsQuery = useQuery({
    queryKey: notificationKeys.summary(agent?.id ?? 'none', 'mention'),
    queryFn: () => notificationApi.list({ filter: 'mention', limit: 1 }),
    enabled: Boolean(agent),
  });
  const unreadMentions = notificationsQuery.data?.unread.mentions ?? 0;
  const unreadMeta = notificationsQuery.isError
    ? t('inbox.unreadLoadFailed')
    : t('inbox.unreadCount', { count: unreadMentions });

  return (
    <TPanel
      title={t('agent.recentInteractions')}
      meta={`${t('agent.recordCount', { count: interactions.length })} · ${unreadMeta}`}
    >
      <div className="max-h-80 overflow-y-auto">
        {interactionsQuery.isPending && <InlineLoading />}

        {interactionsQuery.isError && (
          <div className="flex items-center justify-center gap-2 px-3 py-8 font-sans text-[12px] font-medium tracking-normal text-[var(--t-signal)]">
            <Radio className="h-3.5 w-3.5" />
            {t('agent.recentLoadFailed')}
          </div>
        )}

        {!interactionsQuery.isPending &&
          !interactionsQuery.isError &&
          interactions.length === 0 && (
            <div className="px-3 py-8 text-center font-sans text-[12px] font-medium tracking-normal text-[var(--t-faint)]">
              {t('agent.noInteractions')}
            </div>
          )}

        {!interactionsQuery.isPending && !interactionsQuery.isError && interactions.length > 0 && (
          <div className="border-t border-[var(--t-noise)]">
            {interactions.map((item) => (
              <AgentInteractionCard key={item.id} item={item} compact />
            ))}
          </div>
        )}
      </div>
    </TPanel>
  );
}
