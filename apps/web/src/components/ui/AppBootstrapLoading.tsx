'use client';

import Image from 'next/image';
import { useTranslation } from 'react-i18next';

export function AppBootstrapLoading() {
  const { t } = useTranslation();
  return (
    <div className="initial-page-veil initial-page-veil-visible" role="status" aria-live="polite">
      <div className="initial-page-veil-core">
        <div className="initial-page-veil-mark" aria-hidden="true">
          <Image src="/logo.png" alt="" width={48} height={48} loading="eager" className="h-full w-full rounded-[6px] object-contain" />
        </div>
        <div className="initial-page-veil-label">{t('app.loading')}</div>
      </div>
    </div>
  );
}
