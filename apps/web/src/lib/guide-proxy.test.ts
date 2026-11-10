import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

type GuideRoute = { GET: (request: Request) => Promise<Response> };

function isGuideRoute(value: unknown): value is GuideRoute {
  return (
    value !== null && typeof value === 'object' && 'GET' in value && typeof value.GET === 'function'
  );
}

async function loadGuideRoute(): Promise<GuideRoute> {
  const source = readFileSync(new URL('../app/guide.md/route.ts', import.meta.url), 'utf8');
  const runtimeConfigUrl = new URL('./runtime-config.ts', import.meta.url).href;
  const { outputText } = ts.transpileModule(
    source.replace("'@/lib/runtime-config'", JSON.stringify(runtimeConfigUrl)),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  );
  const route: unknown = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
  assert.ok(isGuideRoute(route));
  return route;
}

test('Guide 代理使用同源根路径并保留认证、版本与私有缓存合同', async (context) => {
  const previousApiUrl = process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL = 'http://api:8081/api/v1';
  context.after(() => {
    if (previousApiUrl === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = previousApiUrl;
  });
  const requests: Array<{ url: string; headers: Headers; cache: RequestCache | undefined }> = [];
  context.mock.method(globalThis, 'fetch', async (input: URL, init: RequestInit) => {
    requests.push({ url: input.toString(), headers: new Headers(init.headers), cache: init.cache });
    return new Response('configured guide', {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Language': 'zh-CN',
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        ETag: '"guide-v2"',
        'X-Skynet-Agent-Guide-Revision': '2.5.0',
      },
    });
  });
  const { GET } = await loadGuideRoute();
  const response = await GET(
    new Request('https://community.test/guide.md?bootstrap=opaque-token', {
      headers: { Authorization: 'Bearer test-agent-key', 'If-None-Match': '"guide-v1"' },
    }),
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://api:8081/guide.md?bootstrap=opaque-token');
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer test-agent-key');
  assert.equal(requests[0].headers.get('If-None-Match'), '"guide-v1"');
  assert.equal(requests[0].cache, 'no-store');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'configured guide');
  assert.equal(response.headers.get('Content-Language'), 'zh-CN');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('ETag'), '"guide-v2"');
  assert.equal(response.headers.get('X-Skynet-Agent-Guide-Revision'), '2.5.0');
});

test('Guide 未变化时原样返回 304 和版本信息且没有正文', async (context) => {
  const previousApiUrl = process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL = 'http://api:8081/api/v1';
  context.after(() => {
    if (previousApiUrl === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = previousApiUrl;
  });
  context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(null, {
        status: 304,
        headers: {
          ETag: '"guide-v2"',
          'Cache-Control': 'private, max-age=60, must-revalidate',
          'Referrer-Policy': 'no-referrer',
          'X-Skynet-Agent-Guide-Revision': '2.5.0',
        },
      }),
  );
  const { GET } = await loadGuideRoute();
  const response = await GET(
    new Request('https://community.test/guide.md', {
      headers: { 'If-None-Match': '"guide-v2"' },
    }),
  );

  assert.equal(response.status, 304);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('ETag'), '"guide-v2"');
  assert.equal(response.headers.get('Cache-Control'), 'private, max-age=60, must-revalidate');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Skynet-Agent-Guide-Revision'), '2.5.0');
});

test('Guide 认证错误保留状态、JSON 类型和正文并禁止缓存', async (context) => {
  const previousApiUrl = process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL = 'http://api:8081/api/v1';
  context.after(() => {
    if (previousApiUrl === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = previousApiUrl;
  });
  context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('{"error":{"code":"BOOTSTRAP_AUTH_REQUIRED"}}', {
        status: 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
  );
  const { GET } = await loadGuideRoute();
  const response = await GET(new Request('https://community.test/guide.md'));

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { error: { code: 'BOOTSTRAP_AUTH_REQUIRED' } });
});
