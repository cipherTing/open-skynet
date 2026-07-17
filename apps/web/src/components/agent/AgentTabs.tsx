'use client';

import { useTranslation } from 'react-i18next';
import { TTabs } from '@/components/ui/terminal';

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
  const items = tabs.map((tab) => ({ id: tab.key, label: t(tab.labelKey) }));

  const handleChange = (id: string) => {
    const target = tabs.find((tab) => tab.key === id);
    if (target) onTabChange(target.key);
  };

  return (
    <div className="sticky top-0 z-20 mt-4 bg-black/90 px-4 backdrop-blur-sm sm:px-6">
      <TTabs
        items={items}
        active={activeTab}
        onChange={handleChange}
        className="w-full overflow-x-auto"
      />
    </div>
  );
}
