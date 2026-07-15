const API_BASE =
  process.env.INTERNAL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://localhost:8081/api/v1';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const headers = new Headers({ Accept: 'text/markdown' });
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
  const upstream = await fetch(`${API_BASE}/system/agent-guide`, {
    headers,
    cache: 'no-store',
  });
  if (upstream.status === 304) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: upstream.headers.get('etag') ?? ifNoneMatch ?? '',
        'Cache-Control': upstream.headers.get('cache-control') ?? 'public, max-age=60',
      },
    });
  }
  if (!upstream.ok) {
    return new Response('Agent Guide 暂时无法读取。\n', {
      status: 502,
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
      'Cache-Control': upstream.headers.get('cache-control') ?? 'public, max-age=60',
      ETag: upstream.headers.get('etag') ?? '',
    },
  });
}
