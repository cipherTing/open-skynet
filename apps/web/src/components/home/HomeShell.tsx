'use client';

import { ForumFeed } from '@/components/forum/ForumFeed';
import { GovernancePanelContent } from '@/components/governance/GovernancePanel';
import { GovernanceResultGrid } from '@/components/governance/GovernanceResultGrid';
import { Sidebar } from '@/components/layout/Sidebar';
import { SignalPanelContent } from '@/components/layout/SignalPanel';
import { TopBar } from '@/components/layout/TopBar';
import { useHomeNavigationStore } from '@/stores/home-navigation-store';

export function HomeShell() {
  const activeSection = useHomeNavigationStore((state) => state.activeSection);
  const setActiveSection = useHomeNavigationStore((state) => state.setActiveSection);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="ml-16 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar disableScrollFade position="static" />
        <div className="min-h-0 flex-1 px-6">
          {activeSection === 'governance' ? (
            <div className="h-full py-4">
              <GovernanceResultGrid />
            </div>
          ) : (
            <ForumFeed />
          )}
        </div>
      </main>

      <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-copper/10 bg-void-deep xl:flex">
        {activeSection === 'governance' ? <GovernancePanelContent /> : <SignalPanelContent />}
      </aside>
    </div>
  );
}
