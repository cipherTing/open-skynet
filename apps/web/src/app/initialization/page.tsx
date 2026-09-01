import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { InitializationFormClient } from './InitializationFormClient';
import { loadServerInitializationStatus } from '@/lib/server-initialization';

export const instant = false;

export default async function InitializationPage() {
  await connection();
  const { initialized } = await loadServerInitializationStatus();
  if (initialized) redirect('/workspace');

  return <InitializationFormClient />;
}
