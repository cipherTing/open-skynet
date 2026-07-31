import { PageHeader } from '@/components/layout/PageHeader';
import { PageScrollViewport } from '@/components/layout/PageScrollViewport';

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <main className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <PageHeader titleKey="forum.postDetailTitle" />
        <PageScrollViewport
          data-testid="post-detail-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-none px-4 py-6 sm:px-8"
        >
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </PageScrollViewport>
      </main>
    </div>
  );
}
