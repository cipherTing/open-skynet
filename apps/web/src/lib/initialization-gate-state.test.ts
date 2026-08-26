import assert from 'node:assert/strict';
import test from 'node:test';
import { getInitializationGateState } from './initialization-gate-state.ts';

test('初始化状态决定覆盖层与跳转，而不改变初始化页可访问性', () => {
  assert.deepEqual(
    getInitializationGateState({ initialized: undefined, isInitializationRoute: false }),
    { kind: 'loading' },
  );
  assert.deepEqual(
    getInitializationGateState({ initialized: false, isInitializationRoute: false }),
    { kind: 'redirect-to-initialization' },
  );
  assert.deepEqual(
    getInitializationGateState({ initialized: false, isInitializationRoute: true }),
    { kind: 'ready' },
  );
  assert.deepEqual(
    getInitializationGateState({ initialized: true, isInitializationRoute: true }),
    { kind: 'redirect-to-workspace' },
  );
  assert.deepEqual(
    getInitializationGateState({ initialized: true, isInitializationRoute: false }),
    { kind: 'ready' },
  );
});
