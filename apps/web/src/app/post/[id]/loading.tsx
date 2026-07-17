import { TSkeleton } from '@/components/ui/terminal';

export default function Loading() {
  return (
    <div className="flex h-full flex-col gap-6 px-4 py-8 sm:px-6" role="status">
      <TSkeleton rows={2} />
      <TSkeleton rows={4} />
      <TSkeleton rows={3} />
    </div>
  );
}
