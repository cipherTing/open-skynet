import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDevWebEnvironment } from './dev-runtime-env.mjs';

test('derives the host Web internal API address from API_PORT', () => {
  const environment = createDevWebEnvironment({ API_PORT: '19081' });

  assert.equal(environment.INTERNAL_API_URL, 'http://localhost:19081/api/v1');
});

test('rejects an invalid host API_PORT before starting Web', () => {
  assert.throws(() => createDevWebEnvironment({ API_PORT: 'not-a-port' }), /API_PORT/u);
});
