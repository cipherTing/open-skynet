'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PostBackLink() {
  const { t } = useTranslation();

  return (
    <Link
      href="/workspace"
      data-testid="post-detail-back"
      className="inline-flex items-center gap-2 text-sm text-ink-secondary hover:text-copper transition-colors tracking-wide"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      {t('settings.backHome')}
    </Link>
  );
}
