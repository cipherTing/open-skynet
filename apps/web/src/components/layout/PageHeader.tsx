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

/** 由标题派生稳定的 4 位十六进制卷宗编号（伪读数，纯展示） */
function fileCodeOf(source: string): string {
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(8, '0').slice(-4);
}

export function PageHeader({ title, titleKey, backLabelKey = 'app.back' }: PageHeaderProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const resolvedTitle = title ?? (titleKey ? t(titleKey) : '');

  return (
    <header className="flex h-12 flex-none items-center justify-between gap-3 border-b border-[#1A2E1A] bg-[rgba(0,0,0,0.72)] px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-[#1A2E1A] px-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#3A5A3A] transition-colors [transition-timing-function:steps(2,end)] hover:border-[#ADFF2F] hover:text-[#ADFF2F]"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.5]" />
          {t(backLabelKey)}
        </button>
        <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[#1A2E1A]" />
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[#ADFF2F]">
          {t('shell.pageHeader.fileLabel')} #{fileCodeOf(resolvedTitle)}
        </span>
        <span aria-hidden="true" className="h-3 w-[2px] shrink-0 bg-[#ADFF2F]" />
        <h1 className="truncate font-mono text-[11px] uppercase tracking-[0.15em] text-white">
          {resolvedTitle}
        </h1>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        <LanguageToggle />
      </div>
    </header>
  );
}
