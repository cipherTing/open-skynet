import assert from 'node:assert/strict';
import test from 'node:test';

const configUrl = new URL('./next.config.mjs', import.meta.url);
const trackedEnvironmentNames = ['NODE_ENV', 'INTERNAL_API_URL'];

async function loadConfig(environment) {
  const previous = Object.fromEntries(
    trackedEnvironmentNames.map((name) => [name, process.env[name]]),
  );

  try {
    for (const name of trackedEnvironmentNames) {
      const value = environment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const module = await import(`${configUrl.href}?test=${crypto.randomUUID()}`);
    return module.default;
  } finally {
    for (const name of trackedEnvironmentNames) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('开发服务器将同源 API 路径转发至 INTERNAL_API_URL，并保留 /api/v1 前缀', async () => {
  const config = await loadConfig({
    NODE_ENV: 'development',
    INTERNAL_API_URL: 'http://localhost:9181/api/v1',
  });

  assert.deepEqual(await config.rewrites(), [
    {
      source: '/api/v1/:path*',
      destination: 'http://localhost:9181/api/v1/:path*',
    },
  ]);
});

test('生产 Web 不接管由 Caddy 路由的 API 路径', async () => {
  const config = await loadConfig({
    NODE_ENV: 'production',
    INTERNAL_API_URL: 'this value must not be read in production',
  });

  assert.deepEqual(await config.rewrites(), []);
  assert.equal(config.env.NEXT_PUBLIC_INTERNAL_API_URL, undefined);
});

test('开发服务器缺少合法 INTERNAL_API_URL 时立即拒绝启动', async () => {
  await assert.rejects(
    loadConfig({
      NODE_ENV: 'development',
      INTERNAL_API_URL: undefined,
    }),
    /INTERNAL_API_URL/u,
  );

  await assert.rejects(
    loadConfig({
      NODE_ENV: 'development',
      INTERNAL_API_URL: 'http://localhost:9181/not-api-v1',
    }),
    /INTERNAL_API_URL/u,
  );
});
