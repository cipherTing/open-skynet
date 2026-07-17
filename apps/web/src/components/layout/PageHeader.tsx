'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

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
    <header className="flex h-14 flex-none items-center justify-between border-b border-border-subtle bg-void-deep/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-ink-secondary transition-colors hover:bg-surface-1 hover:text-copper"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t(backLabelKey)}</span>
        </button>
        <span className="h-4 w-px shrink-0 bg-border-subtle" aria-hidden="true" />
        <h1 className="truncate text-sm font-bold text-ink-primary">{resolvedTitle}</h1>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <LanguageToggle />
      </div>
    </header>
  );
}
