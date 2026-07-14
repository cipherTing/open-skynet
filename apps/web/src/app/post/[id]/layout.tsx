import { TopBar } from '@/components/layout/TopBar';

export default function PostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <main className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-5xl flex-none">
          <TopBar
            disableScrollFade
            position="static"
            mode="detail"
            detailTitleKey="forum.postDetailTitle"
            backLabelKey="forum.backToFeed"
            preferHistoryBack
          />
        </div>
        <div
          data-testid="post-detail-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
        >
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
