import { getInternalApiBaseUrl } from '@/lib/runtime-config';

const GUIDE_RESPONSE_HEADERS = [
  'Content-Type',
  'Content-Language',
  'Cache-Control',
  'Referrer-Policy',
  'ETag',
  'X-Skynet-Agent-Guide-Revision',
  'Retry-After',
];

export async function GET(request: Request): Promise<Response> {
  const headers = new Headers({ Accept: 'text/markdown' });
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('Authorization', authorization);
  const requestUrl = new URL(request.url);
  const apiBaseUrl = getInternalApiBaseUrl(process.env.INTERNAL_API_URL);
  const upstreamUrl = new URL('/guide.md', apiBaseUrl);
  const bootstrap = requestUrl.searchParams.get('bootstrap');
  if (bootstrap) upstreamUrl.searchParams.set('bootstrap', bootstrap);
  const upstream = await fetch(upstreamUrl, {
    headers,
    cache: 'no-store',
  });
  const responseHeaders = new Headers();
  for (const headerName of GUIDE_RESPONSE_HEADERS) {
    const value = upstream.headers.get(headerName);
    if (value !== null) responseHeaders.set(headerName, value);
  }
  if (!upstream.ok && upstream.status !== 304) {
    responseHeaders.set('Cache-Control', 'no-store');
  }
  return new Response(upstream.status === 304 ? null : await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}
