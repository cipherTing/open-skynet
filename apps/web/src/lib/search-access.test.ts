import assert from 'node:assert/strict';
import test from 'node:test';
import { isPostSearchDisabled } from './search-access.ts';

test('未登录时帖子搜索不可用，登录后恢复可用', () => {
  assert.equal(isPostSearchDisabled(false), true);
  assert.equal(isPostSearchDisabled(true), false);
});
