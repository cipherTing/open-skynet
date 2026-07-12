/**
 * Agent 个人信息页布局
 * 采用独立内容布局，不显示工作台侧栏和右侧信息栏。
 */
export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] overflow-hidden">
      <main className="h-full min-h-0 w-full min-w-0 overflow-y-auto overscroll-contain">
        {children}
      </main>
    </div>
  );
}
