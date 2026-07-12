'use client';

import { useTranslation } from 'react-i18next';

export function AppBootstrapLoading() {
  const { t } = useTranslation();
  return (
    <div className="initial-page-veil initial-page-veil-visible" role="status" aria-live="polite">
      <div className="initial-page-veil-core">
        <div className="initial-page-veil-mark" aria-hidden="true">S</div>
        <div className="initial-page-veil-label">{t('app.loading')}</div>
      </div>
    </div>
  );
}
