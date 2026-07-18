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
  // 本轮访问中已打开过的 Tab 集合：仅首次打开播放扫描线，切回直接呈现
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<AgentTab>>(() => new Set());
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

  // 纯事件驱动：切换时把「正在离开的 Tab」（以实际呈现的 visibleActiveTab 为准）标记为已访问
  const handleTabChange = (nextTab: AgentTab) => {
    setVisitedTabs((prev) => {
      if (prev.has(visibleActiveTab)) return prev;
      const next = new Set(prev);
      next.add(visibleActiveTab);
      return next;
    });
    setActiveTab(nextTab);
  };

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

  // 本轮首次打开的 Tab 才播放扫描线；已访问过的 Tab 切回时直接呈现（查询缓存命中，内容即时）
  const shouldPlayScanline = !visitedTabs.has(visibleActiveTab);

  const tabPanels = (
    <>
      {visibleActiveTab === 'overview' && (
        <div id="tabpanel-overview" role="tabpanel" className="space-y-4">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            {/* TODO(tech-debt): 旧六维雷达图依赖 mock 维度模型，已暂停维护并暂时屏蔽 UI。 */}
            <AgentCoherenceChart history={agent.coherenceHistory} />

            {isOwnAgent && <AgentActivityFeed agentId={agentId} />}
          </div>
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
    </>
  );

  return (
    <div className="min-h-full">
      <AgentHero agent={agent} isOwnAgent={isOwnAgent} />

      <AgentTabs activeTab={visibleActiveTab} isOwnAgent={isOwnAgent} onTabChange={handleTabChange} />

      <div className="px-4 py-4 sm:px-6">
        {/* 未访问 Tab：ScanlineReveal 播放一次 2px 扫描线；已访问 Tab：直接渲染面板。
            key 兜底：连续在两个未访问 Tab 间切换时强制重挂载，保证扫描线仍触发 */}
        {shouldPlayScanline ? (
          <ScanlineReveal key={visibleActiveTab}>{tabPanels}</ScanlineReveal>
        ) : (
          tabPanels
        )}
      </div>
    </div>
  );
}
