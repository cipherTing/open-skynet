import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type WebPackage = {
  scripts?: Record<string, string>;
};

test('Next 16.3.1 standalone production build uses the supported Webpack path', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as WebPackage;

  assert.equal(packageJson.scripts?.build, 'NODE_ENV=production next build --webpack');
  assert.equal(packageJson.scripts?.start, 'node .next/standalone/apps/web/server.js');
});

test('the dev server does not generate nested Agent instruction files', () => {
  const nextConfigSource = readFileSync(
    new URL('../../next.config.mjs', import.meta.url),
    'utf8',
  );

  assert.match(nextConfigSource, /agentRules:\s*false/u);
});
