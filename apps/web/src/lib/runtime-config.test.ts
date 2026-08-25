import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  buildMcpEndpoint,
  createRuntimeConfigScript,
  createRuntimeConfigResponse,
  createRuntimeConfigResponseFromEnvironment,
  getBrowserApiBaseUrl,
  getInternalApiBaseUrl,
  getPublicApiBaseUrl,
  getPublicApiBaseUrlFromEnvironment,
} from './runtime-config.ts';
import { buildSecurityHeaders } from './security-headers.ts';

test('浏览器 API 地址与 MCP endpoint 只从 localhost 运行时配置派生', () => {
  const apiBaseUrl = getBrowserApiBaseUrl({
    __SKYNET_RUNTIME_CONFIG__: {
      apiBaseUrl: 'http://localhost:9181/api/v1/',
    },
  });

  assert.equal(apiBaseUrl, 'http://localhost:9181/api/v1');
  assert.equal(buildMcpEndpoint(apiBaseUrl), 'http://localhost:9181/api/v1/mcp');
});

test('缺失或非法的浏览器运行时配置不会接受非 localhost API 地址', () => {
  assert.throws(() => getBrowserApiBaseUrl({}), /runtime config/i);
  assert.throws(
    () =>
      getBrowserApiBaseUrl({
        __SKYNET_RUNTIME_CONFIG__: {
          apiBaseUrl: 'file:///tmp/skynet',
        },
      }),
    /http or https/i,
  );
  assert.throws(
    () =>
      getBrowserApiBaseUrl({
        __SKYNET_RUNTIME_CONFIG__: {
          apiBaseUrl: 'https://api.skynet.example/api/v1',
        },
      }),
    /localhost/i,
  );
});

test('服务端 API 地址只接受 INTERNAL_API_URL', () => {
  assert.equal(getInternalApiBaseUrl('http://api:8081/api/v1/'), 'http://api:8081/api/v1');
  assert.throws(() => getInternalApiBaseUrl(undefined), /INTERNAL_API_URL/u);
});

test('运行时配置从内部注入的公共 API 端口生成可执行 JavaScript', () => {
  const source = createRuntimeConfigScript('9181');
  const context = { window: {} as Record<string, unknown> };

  vm.runInNewContext(source, context);

  const runtimeConfig = context.window.__SKYNET_RUNTIME_CONFIG__ as {
    apiBaseUrl?: unknown;
  };
  assert.equal(runtimeConfig.apiBaseUrl, 'http://localhost:9181/api/v1');
});

test('运行时配置响应禁止缓存', async () => {
  const response = createRuntimeConfigResponse('9181');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/javascript; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /__SKYNET_RUNTIME_CONFIG__/u);
});

test('非法公共 API 端口返回不可缓存的失败响应', async () => {
  const response = createRuntimeConfigResponse('not-a-port');

  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /not-a-port/u);
});

test('运行时配置只依赖内部公共 API 端口', async () => {
  const defaultPortConfig = createRuntimeConfigResponseFromEnvironment({});
  const developmentPortConfig = createRuntimeConfigResponseFromEnvironment({
    API_PORT: '9381',
  });
  const injectedPortConfig = createRuntimeConfigResponseFromEnvironment({
    SKYNET_PUBLIC_API_PORT: '9281',
    API_PORT: '9381',
  });

  assert.equal(defaultPortConfig.status, 200);
  assert.match(await defaultPortConfig.text(), /http:\/\/localhost:8081\/api\/v1/u);
  assert.match(await developmentPortConfig.text(), /http:\/\/localhost:9381\/api\/v1/u);
  const injectedPortConfigBody = await injectedPortConfig.text();
  assert.match(injectedPortConfigBody, /http:\/\/localhost:9281\/api\/v1/u);
});

test('公共 API 端口仅接受有效 TCP 端口', () => {
  assert.equal(getPublicApiBaseUrl(undefined), 'http://localhost:8081/api/v1');
  assert.equal(getPublicApiBaseUrl('80'), 'http://localhost/api/v1');
  assert.throws(() => getPublicApiBaseUrl('0'), /port/i);
  assert.throws(() => getPublicApiBaseUrl('65536'), /port/i);
  assert.throws(() => getPublicApiBaseUrl('8081/api/v1'), /port/i);
});

test('动态 CSP 使用开发环境 API_PORT 派生的 localhost Origin', () => {
  const headers = buildSecurityHeaders(
    getPublicApiBaseUrlFromEnvironment({ API_PORT: '9181' }),
    false,
  );

  assert.match(headers['Content-Security-Policy'], /connect-src 'self' http:\/\/localhost:9181;/u);
  assert.doesNotMatch(headers['Content-Security-Policy'], /unsafe-eval/u);
});
