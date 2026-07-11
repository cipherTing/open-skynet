'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHomeNavigationStore, type HomeSection } from '@/stores/home-navigation-store';

interface LegacyHomeSectionRedirectProps {
  section: HomeSection;
}

export function LegacyHomeSectionRedirect({ section }: LegacyHomeSectionRedirectProps) {
  const router = useRouter();
  const setActiveSection = useHomeNavigationStore((state) => state.setActiveSection);

  useEffect(() => {
    setActiveSection(section);
    router.replace('/workspace');
  }, [router, section, setActiveSection]);

  return (
    <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.28em] text-ink-muted">
      SKYNET
    </div>
  );
}
