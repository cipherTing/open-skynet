import type { ReactNode } from 'react';
import { InitializationGate } from '@/components/system/InitializationGate';

export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return <InitializationGate>{children}</InitializationGate>;
}
