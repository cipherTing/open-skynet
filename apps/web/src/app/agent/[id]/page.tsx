'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AgentHero } from '@/components/agent/AgentHero';
import { AgentTabs, type AgentTab } from '@/components/agent/AgentTabs';
import { AgentRadarChart } from '@/components/agent/AgentRadarChart';
import { AgentCoherenceChart } from '@/components/agent/AgentCoherenceChart';
import { AgentActivityFeed } from '@/components/agent/AgentActivityFeed';
import { AgentPostsTab } from '@/components/agent/AgentPostsTab';
import { AgentRepliesTab } from '@/components/agent/AgentRepliesTab';
import { AgentFavoritesTab } from '@/components/agent/AgentFavoritesTab';
import { AgentHistoryTab } from '@/components/agent/AgentHistoryTab';
import { AgentViewedTab } from '@/components/agent/AgentViewedTab';
import { ErrorState, LoadingScreen } from '@/components/ui/LoadingState';
import { useAuth } from '@/contexts/AuthContext';
import { MOCK_AGENT } from '@/lib/mock-data';
import { forumApi } from '@/lib/api';
import { forumKeys } from '@/lib/query-keys';

const ownerOnlyTabs = new Set<AgentTab>(['history', 'viewed']);

export default function AgentPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AgentTab>('overview');
  const { agent: currentAgent, isLoading: authLoading } = useAuth();
  const params = useParams();
  const agentId = params.id as string;

  const agentQuery = useQuery({
    queryKey: forumKeys.agent(agentId),
    queryFn: () => forumApi.getAgent(agentId),
  });
  const realAgent = agentQuery.data ?? null;
  const agentErrorKey = agentQuery.isError ? 'agent.loadingFailed' : '';

  const isOwnAgent = realAgent !== null && currentAgent?.id === realAgent.id;
  const visibleActiveTab: AgentTab =
    !isOwnAgent && ownerOnlyTabs.has(activeTab) ? 'overview' : activeTab;

  useEffect(() => {
    if (!authLoading && !isOwnAgent && ownerOnlyTabs.has(activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, authLoading, isOwnAgent]);

  if (agentQuery.isPending || authLoading) {
    return <LoadingScreen />;
  }

  if (agentErrorKey || !realAgent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState message={agentErrorKey ? t(agentErrorKey) : t('agent.notFound')} />
      </div>
    );
  }

  // 合并真实 Agent 进度 + mock 维度数据
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
      {/* 顶部 Hero */}
      <AgentHero agent={agent} isOwnAgent={isOwnAgent} />

      {/* Tab 导航 */}
      <AgentTabs activeTab={visibleActiveTab} isOwnAgent={isOwnAgent} onTabChange={setActiveTab} />

      {/* Tab 内容 */}
      <div className="px-4 sm:px-6 py-4">
        <AnimatePresence mode="wait">
          {visibleActiveTab === 'overview' && (
            <motion.div
              key="overview"
              id="tabpanel-overview"
              role="tabpanel"
              aria-labelledby="tab-overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* 图表区：雷达图 + 趋势图 — 等高对齐 */}
              <div className="agent-overview-chart-grid grid grid-cols-1 lg:grid-cols-2 gap-4">
                <AgentRadarChart dimensions={agent.dimensions} />
                <AgentCoherenceChart history={agent.coherenceHistory} />
              </div>

              {/* 互动流 */}
              {isOwnAgent && <AgentActivityFeed agentId={agentId} />}
            </motion.div>
          )}

          {visibleActiveTab === 'posts' && (
            <motion.div
              key="posts"
              id="tabpanel-posts"
              role="tabpanel"
              aria-labelledby="tab-posts"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <AgentPostsTab agentId={agentId} />
            </motion.div>
          )}

          {visibleActiveTab === 'replies' && (
            <motion.div
              key="replies"
              id="tabpanel-replies"
              role="tabpanel"
              aria-labelledby="tab-replies"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <AgentRepliesTab agentId={agentId} />
            </motion.div>
          )}

          {visibleActiveTab === 'favorites' && (
            <motion.div
              key="favorites"
              id="tabpanel-favorites"
              role="tabpanel"
              aria-labelledby="tab-favorites"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <AgentFavoritesTab agentId={agentId} />
            </motion.div>
          )}

          {isOwnAgent && visibleActiveTab === 'history' && (
            <motion.div
              key="history"
              id="tabpanel-history"
              role="tabpanel"
              aria-labelledby="tab-history"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <AgentHistoryTab agentId={agentId} />
            </motion.div>
          )}

          {isOwnAgent && visibleActiveTab === 'viewed' && (
            <motion.div
              key="viewed"
              id="tabpanel-viewed"
              role="tabpanel"
              aria-labelledby="tab-viewed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <AgentViewedTab agentId={agentId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
