import assert from 'node:assert/strict';
import test from 'node:test';

test('帖子回复通知保留原来的精确回复入口', async () => {
  const { notificationTargetHref } = await import('./notification-navigation.ts');
  assert.equal(
    notificationTargetHref({
      type: 'REPLY',
      id: 'reply-2',
      postId: 'post-3',
      title: null,
      excerpt: null,
    }),
    '/post/post-3?replyId=reply-2',
  );
});

test('不能为非论坛目标构造通知链接', async () => {
  const { notificationTargetHref } = await import('./notification-navigation.ts');
  assert.equal(
    notificationTargetHref({
      type: 'ANNOUNCEMENT',
      id: 'announcement-1',
      postId: null,
      title: null,
      excerpt: null,
    }),
    null,
  );
});
