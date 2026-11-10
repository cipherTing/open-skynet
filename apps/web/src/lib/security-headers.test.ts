import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSecurityHeaders } from './security-headers.ts';

for (const isDevelopment of [true, false]) {
  test(`Guide 文档在${isDevelopment ? '开发' : '生产'}环境中禁止发送 Referer`, () => {
    const headers = buildSecurityHeaders(isDevelopment, '/guide.md');

    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
  });
}

test('普通页面继续使用原有 Referrer 策略', () => {
  for (const pathname of ['/', '/stories/story-1', '/guide.md/help']) {
    const headers = buildSecurityHeaders(false, pathname);

    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  }
});
