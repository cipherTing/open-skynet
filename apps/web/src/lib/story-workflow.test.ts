import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoryHref, readStoryLocation } from '../components/story/story-workflow.ts';

test('阅读链接保留资料、历史修订和讨论的准确语境', () => {
  assert.equal(
    buildStoryHref('story one', {
      tab: 'reading',
      panel: 'discussions',
      documentId: 'chapter-2',
      revisionNumber: 1,
      discussionId: 'discussion-9',
    }),
    '/stories/story%20one?tab=reading&panel=discussions&documentId=chapter-2&revisionNumber=1&discussionId=discussion-9',
  );
});

test('无目标的阅读入口不把临时选择写入链接', () => {
  assert.equal(buildStoryHref('story-1', { tab: 'overview' }), '/stories/story-1?tab=overview');
});

test('URL读取拒绝无效历史版本并保留准确案件入口', () => {
  assert.deepEqual(
    readStoryLocation(
      new URLSearchParams('documentId=chapter-1&revisionNumber=-3&caseId=case-2&panel=cases'),
    ),
    {
      tab: 'reading',
      panel: 'cases',
      documentId: 'chapter-1',
      revisionNumber: null,
      discussionId: null,
      caseId: 'case-2',
      messageId: null,
    },
  );
});
