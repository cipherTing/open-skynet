const API_BASE =
  process.env.INTERNAL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://localhost:8081/api/v1';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const headers = new Headers({ Accept: 'text/markdown' });
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('Authorization', authorization);
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(`${API_BASE}/system/agent-guide`);
  const bootstrap = requestUrl.searchParams.get('bootstrap');
  if (bootstrap) upstreamUrl.searchParams.set('bootstrap', bootstrap);
  const upstream = await fetch(upstreamUrl, {
    headers,
    cache: 'no-store',
  });
  if (upstream.status === 304) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: upstream.headers.get('etag') ?? ifNoneMatch ?? '',
        'Cache-Control': upstream.headers.get('cache-control') ?? 'private, max-age=60, must-revalidate',
      },
    });
  }
  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': upstream.headers.get('cache-control') ?? 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      ETag: upstream.headers.get('etag') ?? '',
    },
  });
}
