'use client';

import { usePathname } from 'next/navigation';
import { NetworkCanvas } from './NetworkCanvas';

export function RouteNetworkCanvas() {
  const pathname = usePathname();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;
  return <NetworkCanvas />;
}
