import { Suspense, type ReactNode } from 'react';
import { InitializationGate } from '@/components/system/InitializationGate';
import { AppBootstrapLoading } from '@/components/ui/AppBootstrapLoading';

export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppBootstrapLoading />}>
      <InitializationGate>{children}</InitializationGate>
    </Suspense>
  );
}
