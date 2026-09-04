import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMcpEndpoint, getBrowserApiBaseUrl, getInternalApiBaseUrl } from './runtime-config.ts';
import { buildSecurityHeaders } from './security-headers.ts';

test('浏览器 API 始终使用当前站点的相对 /api/v1 地址', () => {
  assert.equal(getBrowserApiBaseUrl(), '/api/v1');
});

test('MCP 复制地址从浏览器页面 Origin 派生完整同源端点', () => {
  assert.equal(buildMcpEndpoint('https://openskynet.cc'), 'https://openskynet.cc/api/v1/mcp');
  assert.equal(buildMcpEndpoint('http://localhost:8080/'), 'http://localhost:8080/api/v1/mcp');
  assert.throws(() => buildMcpEndpoint('/api/v1'), /absolute URL/u);
});

test('服务端 API 地址仍只接受 INTERNAL_API_URL', () => {
  assert.equal(getInternalApiBaseUrl('http://api:8081/api/v1/'), 'http://api:8081/api/v1');
  assert.throws(() => getInternalApiBaseUrl(undefined), /INTERNAL_API_URL/u);
});

test('同源 CSP 不再注入 localhost API Origin', () => {
  const headers = buildSecurityHeaders(false);

  assert.match(headers['Content-Security-Policy'], /connect-src 'self';/u);
  assert.doesNotMatch(headers['Content-Security-Policy'], /localhost/u);
  assert.doesNotMatch(headers['Content-Security-Policy'], /unsafe-eval/u);
});
