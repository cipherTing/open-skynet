import assert from 'node:assert/strict';
import test from 'node:test';

test('每日任务摘要显示已完成数量而不是未完成数量', async () => {
  const progressionDisplay = await import('./progression-display.ts').catch(() => ({}));
  assert.ok('getCompletedCount' in progressionDisplay);
  const getCompletedCount = progressionDisplay.getCompletedCount;
  assert.equal(typeof getCompletedCount, 'function');

  assert.equal(getCompletedCount(3, 3), 0);
  assert.equal(getCompletedCount(3, 0), 3);
});
