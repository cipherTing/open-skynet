import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const queryKeysSource = readFileSync(new URL('./query-keys.ts', import.meta.url), 'utf8');
const topBarSource = readFileSync(
  new URL('../components/layout/TopBar.tsx', import.meta.url),
  'utf8',
);
const notificationCenterSource = readFileSync(
  new URL('../components/inbox/NotificationCenter.tsx', import.meta.url),
  'utf8',
);
const activitySource = readFileSync(
  new URL('../components/agent/AgentActivityFeed.tsx', import.meta.url),
  'utf8',
);
const postDetailSource = readFileSync(
  new URL('../components/forum/PostDetail.tsx', import.meta.url),
  'utf8',
);
const replyThreadSource = readFileSync(
  new URL('../components/forum/ReplyThread.tsx', import.meta.url),
  'utf8',
);

test('通知摘要与无限列表使用不同的查询键', () => {
  assert.match(queryKeysSource, /summary:\s*\(agentId: string, filter: NotificationFilter\)/u);
  assert.match(topBarSource, /notificationKeys\.summary\(agent\?\.id \?\? 'none', 'all'\)/u);
  assert.match(notificationCenterSource, /notificationKeys\.list\(agent\?\.id \?\? 'none', filter\)/u);
});

test('通知分页失败保留已有列表并提供尾部重试', () => {
  assert.match(notificationCenterSource, /query\.isFetchNextPageError/u);
  assert.match(notificationCenterSource, /fetchNextPage\(\{ cancelRefetch: false \}\)/u);
  assert.match(notificationCenterSource, /Footer: \(\) =>/u);
});

test('活动摘要按当前 Agent 隔离缓存', () => {
  assert.match(activitySource, /notificationKeys\.summary\(agent\?\.id \?\? 'none', 'mention'\)/u);
});

test('帖子与回复正文统一使用带头像的提及渲染器', () => {
  assert.match(postDetailSource, /<MentionMarkdown\s/u);
  assert.match(replyThreadSource, /<MentionMarkdown\s/u);
});

test('提及链接行内渲染且没有底部线条，避免 div-in-p hydration 报错', () => {
  const mentionSource = readFileSync(
    new URL('../components/forum/MentionMarkdown.tsx', import.meta.url),
    'utf8',
  );
  const avatarSource = readFileSync(
    new URL('../components/ui/AgentAvatar.tsx', import.meta.url),
    'utf8',
  );
  const globalCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

  assert.match(mentionSource, /mention-link/u);
  assert.match(mentionSource, /<AgentAvatar[^>]*\binline\b/u);
  assert.match(avatarSource, /inline \? 'span' : 'div'/u);
  assert.match(globalCss, /\.prose-deck a\.mention-link \{\s*border-bottom: none;/u);
});
