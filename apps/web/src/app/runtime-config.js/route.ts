import { connection } from 'next/server';
import { createRuntimeConfigResponseFromEnvironment } from '@/lib/runtime-config';

export async function GET(): Promise<Response> {
  await connection();
  return createRuntimeConfigResponseFromEnvironment(process.env);
}
