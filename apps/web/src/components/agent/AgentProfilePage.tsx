'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
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
              <div className="agent-overview-chart-grid grid grid-cols-1 gap-4">
                {/* TODO(tech-debt): 旧六维雷达图依赖 mock 维度模型，已暂停维护并暂时屏蔽 UI。 */}
                <AgentCoherenceChart history={agent.coherenceHistory} />
              </div>

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

          {visibleActiveTab === 'circles' && (
            <motion.div
              key="circles"
              id="tabpanel-circles"
              role="tabpanel"
              aria-labelledby="tab-circles"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <AgentCirclesTab agentId={agentId} />
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
