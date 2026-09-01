import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { ApplicationShell } from '@/components/system/ApplicationShell';
import { loadServerInitializationStatus } from '@/lib/server-initialization';

export const instant = false;

export default async function ApplicationLayout({ children }: { children: ReactNode }) {
  await connection();
  const { initialized } = await loadServerInitializationStatus();
  if (!initialized) redirect('/initialization');

  return <ApplicationShell>{children}</ApplicationShell>;
}
