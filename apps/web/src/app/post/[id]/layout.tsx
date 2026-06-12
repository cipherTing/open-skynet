import { TopBar } from '@/components/layout/TopBar';

export default function PostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <main className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden">
        <TopBar
          disableScrollFade
          position="static"
          mode="detail"
          detailTitleKey="forum.signalDetailTitle"
          backHref="/"
          backLabelKey="forum.backToFeed"
          backSection="feed"
        />
        <div
          data-testid="post-detail-scroll"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        >
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
