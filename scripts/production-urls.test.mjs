import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptsDir, 'check-production-urls.mjs');

function run(overrides = {}) {
  return spawnSync(process.execPath, [checker], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CORS_ORIGIN: 'https://app.example.com, https://admin.example.com',
      NEXT_PUBLIC_API_URL: 'https://api.example.com/api/v1',
      PUBLIC_SITE_ORIGIN: 'https://community.example.com',
      PUBLIC_API_BASE_URL: 'https://api.example.com/api/v1',
      ...overrides,
    },
  });
}

test('production URL checker accepts HTTPS public origins', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('production URL checker requires the primary public URL variables', () => {
  const result = run({ CORS_ORIGIN: '' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /CORS_ORIGIN/);
});

test('production URL checker rejects HTTP and loopback hosts', () => {
  const insecure = run({ NEXT_PUBLIC_API_URL: 'http://api.example.com/api/v1' });
  assert.notEqual(insecure.status, 0);
  assert.match(`${insecure.stdout}${insecure.stderr}`, /HTTPS/i);

  const loopback = run({ CORS_ORIGIN: 'https://127.0.0.1' });
  assert.notEqual(loopback.status, 0);
  assert.match(`${loopback.stdout}${loopback.stderr}`, /loopback|localhost/i);
});
