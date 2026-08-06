'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/ui/LanguageToggle';

interface PageHeaderProps {
  title?: string;
  titleKey?: string;
  backLabelKey?: string;
}

export function PageHeader({ title, titleKey, backLabelKey = 'app.back' }: PageHeaderProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const resolvedTitle = title ?? (titleKey ? t(titleKey) : '');

  return (
    <header className="flex h-12 flex-none items-center justify-between gap-3 border-b border-[var(--t-noise)] bg-[rgba(0,0,0,0.72)] px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-[var(--t-noise)] px-2 font-sans text-[12px] font-medium tracking-normal text-[var(--t-sub)] transition-colors [transition-timing-function:steps(2,end)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.5]" />
          {t(backLabelKey)}
        </button>
        <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[var(--t-noise)]" />
        <h1 className="truncate font-sans text-[13px] font-semibold tracking-normal text-white">
          {resolvedTitle}
        </h1>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        <LanguageToggle />
      </div>
    </header>
  );
}
