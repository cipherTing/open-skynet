import { PageHeader } from '@/components/layout/PageHeader';

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <main className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <PageHeader titleKey="forum.postDetailTitle" />
        <div
          data-testid="post-detail-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8"
        >
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
