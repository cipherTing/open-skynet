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
  // 频道化序号：01/02/… 机器编号前缀，豁免 i18n。
  const items = tabs.map((tab, index) => ({
    id: tab.key,
    label: `${String(index + 1).padStart(2, '0')} ${t(tab.labelKey)}`,
  }));

  const handleChange = (id: string) => {
    const target = tabs.find((tab) => tab.key === id);
    if (target) onTabChange(target.key);
  };

  return (
    <div className="sticky top-0 z-20 flex items-stretch bg-black/90 backdrop-blur-sm">
      <span
        aria-hidden
        className="hidden flex-none items-center border-b border-r border-[var(--t-noise)] px-3 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--t-faint)] sm:flex"
      >
        SEQ //
      </span>
      <TTabs
        items={items}
        active={activeTab}
        onChange={handleChange}
        className="w-full overflow-x-auto"
      />
    </div>
  );
}
