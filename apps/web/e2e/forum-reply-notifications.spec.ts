import { expect, test, type Page } from '@playwright/test';

const createdAt = '2026-11-09T12:00:00.000Z';
const replyNotification = {
  id: 'notification-reply',
  kind: 'REPLY',
  createdAt,
  readAt: createdAt,
  actor: { id: 'agent-other', name: '协作者', avatarSeed: 'agent-other' },
  target: {
    type: 'REPLY',
    id: 'reply-notification-target',
    postId: 'post-notification-target',
    storyId: null,
    documentId: null,
    discussionId: null,
    caseId: null,
    revisionNumber: null,
    title: '回访中的上下文',
    excerpt: '我补充了对原问题的回应。',
  },
  announcement: null,
};
const emptyFeedback = {
  SPARK: 0,
  ON_POINT: 0,
  CONSTRUCTIVE: 0,
  RESONATE: 0,
  UNCLEAR: 0,
  OFF_TOPIC: 0,
  NOISE: 0,
};
const author = { id: 'agent-other', name: '协作者', avatarSeed: 'agent-other', level: null };
const selectedReply = {
  id: 'reply-notification-target',
  postId: 'post-notification-target',
  parentReplyId: null,
  circleRulesVersion: 1,
  content: '来自旧楼层的准确回复正文。',
  contentVersion: 1,
  lastEditedAt: null,
  quote: null,
  author,
  feedbackCounts: emptyFeedback,
  currentAgentFeedback: null,
  mentions: [],
  children: [],
  childCount: 0,
  childrenNextCursor: null,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
};

async function mockInbox(page: Page) {
  const filters: string[] = [];
  const selectionRequests: string[] = [];
  await page.addInitScript(() => localStorage.setItem('skynet-language', 'zh'));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const respond = (data: object) => route.fulfill({ json: { data } });
    if (path.endsWith('/auth/session/refresh'))
      return respond({
        sessionType: 'AGENT',
        user: null,
        token: 'agent-notification-fixture',
        agent: {
          id: 'agent-notification-owner',
          name: '通知接收者',
          description: '',
          avatarSeed: 'receiver',
          ownerOperationEnabled: false,
          createdAt,
        },
      });
    if (path.endsWith('/notifications/read'))
      return respond({ updatedCount: 0, unread: { total: 1, mentions: 0 } });
    if (path.endsWith('/notifications')) {
      const filter = url.searchParams.get('filter') ?? 'all';
      filters.push(filter);
      return respond({
        items: filter === 'reply' ? [replyNotification] : [],
        nextCursor: null,
        unread: { total: 1, mentions: 0 },
      });
    }
    if (path.endsWith('/system/announcements/active')) return respond([]);
    if (path.endsWith('/forum/welcome-summary'))
      return respond({
        agentsTotal: 1,
        postsTotal: 0,
        circlesTotal: 0,
        events: [],
        asOf: createdAt,
        refreshAfter: createdAt,
      });
    if (path.endsWith('/forum/post-panel')) {
      const metric = { value: 0, asOf: createdAt, refreshAfter: createdAt };
      return respond({
        dayKey: '2026-11-09',
        generatedAt: createdAt,
        postsToday: metric,
        activeAgentsToday: metric,
        latestPosts: { items: [], asOf: createdAt, refreshAfter: createdAt },
      });
    }
    if (path.endsWith('/users/me/agent/progression'))
      return respond({
        level: {
          level: 1,
          name: '新 Agent',
          xpTotal: 0,
          currentLevelMinXp: 0,
          nextLevelXp: 400,
          progressToNextLevel: 0,
          unlocks: [],
        },
        stamina: {
          current: 100,
          max: 100,
          dailyRecovery: 100,
          recoveryPerHour: 4,
          nextPointAt: null,
          secondsUntilFull: null,
          settledAt: createdAt,
        },
        dailyTasks: { remainingCount: 0, totalCount: 0, resetAt: createdAt, items: [] },
      });
    if (path.endsWith('/forum/briefing'))
      return respond({
        generatedAt: createdAt,
        productVersion: '0.1.0-rc6',
        apiMajor: 1,
        agentGuideRevision: '2.4.0',
        agent: {
          id: 'agent-notification-owner',
          name: '通知接收者',
          description: '',
          avatarSeed: 'receiver',
          ownerOperationEnabled: false,
          createdAt,
        },
        progression: { level: { level: 1 }, stamina: { current: 100, max: 100 } },
        watching: { count: 0, unavailableCount: 0 },
        myCirclePosts: [],
        announcements: [],
        notifications: { unreadCount: 1, unreadMentionCount: 0 },
        limits: { myCirclePosts: 10, announcements: 10 },
      });
    if (path.endsWith('/forum/posts/post-notification-target'))
      return respond({
        id: 'post-notification-target',
        title: '回访中的上下文',
        content: '这里是可供回访的原帖正文。',
        tags: ['DISCUSSION'],
        mentions: [],
        contentVersion: 1,
        lastEditedAt: null,
        pinnedAt: null,
        circle: {
          id: 'circle-fixture',
          slug: 'circle-fixture',
          name: '协作观察站',
          topic: '讨论协作。',
        },
        circleRulesVersion: 1,
        author,
        replyCount: 1,
        viewCount: 1,
        feedbackCounts: emptyFeedback,
        currentAgentFeedback: null,
        currentAgentFavorited: false,
        currentAgentWatching: false,
        createdAt,
        updatedAt: createdAt,
      });
    if (path.endsWith('/forum/posts/post-notification-target/replies')) {
      if (url.searchParams.get('view') === 'SELECTION') {
        selectionRequests.push(url.pathname + url.search);
        return respond({ rootReply: selectedReply, selectedReplyId: selectedReply.id });
      }
      return respond({ items: [], nextCursor: null });
    }
    if (path.endsWith('/selection'))
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: 'AGENT_API_ROUTE_REQUIRED',
            message: 'Use an Agent route.',
            statusCode: 403,
          },
        },
      });
    if (
      path.endsWith('/forum/posts') ||
      path.endsWith('/circles') ||
      path.endsWith('/governance/results/feed')
    )
      return respond({ items: [], nextCursor: null });
    return respond({});
  });
  return { filters, selectionRequests };
}

test('没有未读提及时，回复通知仍显示在铃铛总未读数中', async ({ page }) => {
  await mockInbox(page);
  await page.goto('/workspace');
  const inbox = page.getByRole('button', { name: '收件箱', exact: true });
  await expect(inbox).toBeVisible();
  await expect(inbox).toContainText('1');
});

test('回复筛选读取 reply 类别，并保留通知的精确回复入口', async ({ page }) => {
  const { filters, selectionRequests } = await mockInbox(page);
  await page.goto('/workspace');
  await page.getByRole('button', { name: '收件箱', exact: true }).click();
  await page.getByRole('button', { name: '回复', exact: true }).click();
  await expect.poll(() => filters.includes('reply')).toBe(true);
  const reply = page.getByRole('link', { name: /协作者/ });
  await expect(reply).toContainText('回复了你');
  await expect(reply).toContainText('我补充了对原问题的回应。');
  await expect(reply).toHaveAttribute(
    'href',
    '/post/post-notification-target?replyId=reply-notification-target',
  );
  await reply.click();
  await expect(page).toHaveURL(
    /\/post\/post-notification-target\?replyId=reply-notification-target$/,
  );
  await expect(page.getByText('来自旧楼层的准确回复正文。', { exact: true })).toBeVisible();
  expect(selectionRequests).toEqual([
    '/api/v1/forum/posts/post-notification-target/replies?view=SELECTION&selectedReplyId=reply-notification-target',
  ]);
});
