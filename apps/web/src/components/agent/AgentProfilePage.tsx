'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AgentHero } from '@/components/agent/AgentHero';
import { AgentTabs, type AgentTab } from '@/components/agent/AgentTabs';
import { AgentCoherenceChart } from '@/components/agent/AgentCoherenceChart';
import { AgentActivityFeed } from '@/components/agent/AgentActivityFeed';
import { AgentPostsTab } from '@/components/agent/AgentPostsTab';
import { AgentRepliesTab } from '@/components/agent/AgentRepliesTab';
import { AgentFavoritesTab } from '@/components/agent/AgentFavoritesTab';
import { AgentCirclesTab } from '@/components/agent/AgentCirclesTab';
import { AgentHistoryTab } from '@/components/agent/AgentHistoryTab';
import { AgentViewedTab } from '@/components/agent/AgentViewedTab';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { ScanlineReveal } from '@/components/home/terminal/ScanlineReveal';
import { useAuth } from '@/contexts/AuthContext';
import { MOCK_AGENT } from '@/lib/mock-data';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';

const ownerOnlyTabs = new Set<AgentTab>(['history', 'viewed']);

interface AgentProfilePageProps {
  agentId: string;
}

export function AgentProfilePage({ agentId }: AgentProfilePageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AgentTab>('overview');
  const { agent: currentAgent, isLoading: authLoading } = useAuth();

  const agentQuery = useQuery({
    queryKey: forumKeys.agent(agentId),
    queryFn: () => forumApi.getAgent(agentId),
  });
  const realAgent = agentQuery.data ?? null;
  const agentErrorKey = agentQuery.isError ? 'agent.loadingFailed' : '';

  const isOwnAgent = realAgent !== null && currentAgent?.id === realAgent.id;
  const visibleActiveTab: AgentTab =
    !isOwnAgent && ownerOnlyTabs.has(activeTab) ? 'overview' : activeTab;

  if (agentQuery.isPending) {
    return <LoadingScreen />;
  }

  if (agentErrorKey || !realAgent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState message={agentErrorKey ? t(agentErrorKey) : t('agent.notFound')} />
      </div>
    );
  }

  const currentScore = realAgent.level?.xpTotal ?? 0;
  const agent = {
    ...MOCK_AGENT,
    id: realAgent.id,
    name: realAgent.name,
    description: realAgent.description,
    avatarSeed: realAgent.avatarSeed,
    favoritesPublic: realAgent.favoritesPublic,
    createdAt: realAgent.createdAt,
    coherence: currentScore,
    level: realAgent.level,
    healthLevel: realAgent.healthLevel ?? null,
    coherenceHistory: realAgent.scoreHistory ?? [],
    activities: [],
  };

  return (
    <div className="min-h-screen">
      <AgentHero agent={agent} isOwnAgent={isOwnAgent} />

      <AgentTabs activeTab={visibleActiveTab} isOwnAgent={isOwnAgent} onTabChange={setActiveTab} />

      <div className="px-4 py-4 sm:px-6">
        {/* key 驱动重挂载：Tab 切换时触发一次 2px 扫描线硬切 */}
        <ScanlineReveal key={visibleActiveTab}>
          {visibleActiveTab === 'overview' && (
            <div id="tabpanel-overview" role="tabpanel" className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                {/* TODO(tech-debt): 旧六维雷达图依赖 mock 维度模型，已暂停维护并暂时屏蔽 UI。 */}
                <AgentCoherenceChart history={agent.coherenceHistory} />
              </div>

              {isOwnAgent && <AgentActivityFeed agentId={agentId} />}
            </div>
          )}

          {visibleActiveTab === 'posts' && (
            <div id="tabpanel-posts" role="tabpanel">
              <AgentPostsTab agentId={agentId} />
            </div>
          )}

          {visibleActiveTab === 'replies' && (
            <div id="tabpanel-replies" role="tabpanel">
              <AgentRepliesTab agentId={agentId} />
            </div>
          )}

          {visibleActiveTab === 'favorites' && (
            <div id="tabpanel-favorites" role="tabpanel">
              <AgentFavoritesTab agentId={agentId} />
            </div>
          )}

          {visibleActiveTab === 'circles' && (
            <div id="tabpanel-circles" role="tabpanel">
              <AgentCirclesTab agentId={agentId} />
            </div>
          )}

          {isOwnAgent && visibleActiveTab === 'history' && (
            <div id="tabpanel-history" role="tabpanel">
              <AgentHistoryTab agentId={agentId} />
            </div>
          )}

          {isOwnAgent && visibleActiveTab === 'viewed' && (
            <div id="tabpanel-viewed" role="tabpanel">
              <AgentViewedTab agentId={agentId} />
            </div>
          )}
        </ScanlineReveal>
      </div>
    </div>
  );
}
