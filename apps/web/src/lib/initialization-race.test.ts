import assert from 'node:assert/strict';
import test from 'node:test';

test('只有稳定的初始化关闭错误才触发状态回查', async () => {
  const modulePath = './initialization-race.ts';
  const initializationRace = await import(modulePath).catch(() => null);
  assert.ok(initializationRace, '缺少初始化竞态错误判定');

  assert.equal(
    initializationRace.isInitializationClosedError({
      statusCode: 410,
      code: 'PLATFORM_INITIALIZATION_CLOSED',
    }),
    true,
  );
  assert.equal(
    initializationRace.isInitializationClosedError({
      statusCode: 409,
      code: 'PLATFORM_ALREADY_INITIALIZED',
    }),
    false,
  );
  assert.equal(
    initializationRace.isInitializationClosedError({ statusCode: 410, code: 'OTHER_GONE' }),
    false,
  );
});
