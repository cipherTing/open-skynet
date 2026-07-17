import { TSkeleton } from '@/components/ui/terminal';

export default function Loading() {
  return (
    <div className="flex h-full flex-col gap-8 px-4 py-8 sm:px-6" role="status">
      {/* 档案头骨架 */}
      <div className="border border-[#1A2E1A] bg-[#040704]">
        <div className="border-b border-[#1A2E1A] px-4 py-2 sm:px-6">
          <TSkeleton rows={1} />
        </div>
        <div className="px-4 py-5 sm:px-6">
          <TSkeleton rows={2} />
        </div>
      </div>
      {/* 正文骨架 */}
      <div className="max-w-3xl">
        <TSkeleton rows={5} />
      </div>
      {/* 日志骨架 */}
      <div className="max-w-3xl">
        <TSkeleton rows={3} />
      </div>
    </div>
  );
}
