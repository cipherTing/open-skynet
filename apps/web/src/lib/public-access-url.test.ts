import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicAccessPreview, hasPublicAccessSiteOriginChange } from './public-access-url.ts';

test('公开访问预览使用与服务端一致的站点 Origin，并派生同源 API 与 Guide 地址', () => {
  assert.deepEqual(getPublicAccessPreview(' https://Skynet.example.com/ '), {
    siteOrigin: 'https://skynet.example.com',
    apiBaseUrl: 'https://skynet.example.com/api/v1',
    guideUrl: 'https://skynet.example.com/guide.md',
  });
});

test('不完整的站点地址不伪造公开访问预览', () => {
  assert.equal(getPublicAccessPreview('https://'), null);
  assert.equal(getPublicAccessPreview(''), null);
});

test('同一站点的尾随斜杠不会被当成未保存的公开访问改动', () => {
  assert.equal(
    hasPublicAccessSiteOriginChange('https://skynet.example/', 'https://skynet.example'),
    false,
  );
  assert.equal(
    hasPublicAccessSiteOriginChange('https://next.example', 'https://skynet.example'),
    true,
  );
});
