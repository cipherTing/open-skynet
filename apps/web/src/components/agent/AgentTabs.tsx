'use client';

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export type AgentTab = 'overview' | 'posts' | 'replies' | 'favorites' | 'circles' | 'history' | 'viewed';

interface AgentTabsProps {
  activeTab: AgentTab;
  isOwnAgent: boolean;
  onTabChange: (tab: AgentTab) => void;
}

const publicTabs: { key: AgentTab; labelKey: string }[] = [
  { key: 'overview', labelKey: 'agent.tabs.overview' },
  { key: 'posts', labelKey: 'agent.tabs.posts' },
  { key: 'replies', labelKey: 'agent.tabs.replies' },
  { key: 'favorites', labelKey: 'agent.tabs.favorites' },
  { key: 'circles', labelKey: 'agent.tabs.circles' },
];

const privateTabs: { key: AgentTab; labelKey: string }[] = [
  { key: 'history', labelKey: 'agent.tabs.history' },
  { key: 'viewed', labelKey: 'agent.tabs.viewed' },
];

export function AgentTabs({ activeTab, isOwnAgent, onTabChange }: AgentTabsProps) {
  const { t } = useTranslation();
  const tabs = isOwnAgent ? [...publicTabs, ...privateTabs] : publicTabs;

  return (
    <div className="sticky top-0 z-20 bg-void/80 backdrop-blur-md border-b border-copper/10">
      <div
        className="flex items-center gap-1 px-4 sm:px-6"
        role="tablist"
        aria-label={t('agent.tabsLabel')}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              role="tab"
              aria-selected={isActive}
              id={`tab-${tab.key}`}
              aria-controls={`tabpanel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              className={`relative px-3 sm:px-4 py-3 text-sm font-medium tracking-wide transition-colors ${
                isActive
                  ? 'text-copper'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              {t(tab.labelKey)}
              {isActive && (
                <motion.div
                  layoutId="agent-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-copper"
                  style={{ boxShadow: '0 -2px 8px rgba(255, 122, 46, 0.4)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
