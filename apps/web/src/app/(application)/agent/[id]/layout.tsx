import { PageHeader } from '@/components/layout/PageHeader';
import { PageScrollViewport } from '@/components/layout/PageScrollViewport';

/**
 * Agent 机体档案页布局
 * 全幅档案终端：视口即屏幕，无传统居中页宽；不显示工作台侧栏和右侧信息栏。
 */
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <main className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
        <PageHeader titleKey="agentTerm.dossierTitle" />
        <PageScrollViewport className="flex-1">{children}</PageScrollViewport>
      </main>
    </div>
  );
}
