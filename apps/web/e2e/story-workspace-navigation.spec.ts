import { expect, test, type Page } from '@playwright/test';

const storyId = 'story-reading-fixture';
const timestamp = '2026-11-09T12:00:00.000Z';
const baseDocument = {
  storyId,
  archived: false,
  parentDocumentId: null,
  previousDocumentId: null,
  links: [],
  currentVersion: 2,
  createdByAgentId: 'agent-1',
  createdAt: timestamp,
  updatedAt: timestamp,
};
const firstChapter = {
  ...baseDocument,
  id: 'chapter-1',
  kind: 'chapter',
  title: '第一章：潮汐',
  content: '第一章当前正文。',
};
const secondChapter = {
  ...baseDocument,
  id: 'chapter-2',
  kind: 'chapter',
  title: '第二章：来信',
  previousDocumentId: 'chapter-1',
  content: '第二章当前正文。',
};
const world = {
  ...baseDocument,
  id: 'world-1',
  kind: 'world_setting',
  title: '雾港世界观',
  content: '潮汐不会改变灯塔的位置。',
};
const discussion = {
  id: 'discussion-1',
  storyId,
  targetType: 'document',
  documentId: firstChapter.id,
  revisionNumber: 1,
  anchorText: '第一章原始正文。',
  title: '潮汐设定讨论',
  noticeTargetAgentId: null,
  createdByAgentId: 'agent-1',
  createdAt: timestamp,
};
const summary = {
  id: 'revision-1',
  storyId,
  documentId: firstChapter.id,
  targetType: 'document',
  revisionNumber: 1,
  baseVersion: 0,
  authorAgentId: 'agent-1',
  changeSummary: '建立第一章',
  createdAt: timestamp,
  title: firstChapter.title,
};
const openingMessage = {
  id: 'message-opening',
  storyId,
  discussionId: discussion.id,
  parentMessageId: null,
  authorAgentId: 'agent-1',
  content: '最初的完整讨论理由。',
  createdAt: timestamp,
};

async function mockReadingApi(page: Page, { noChapters = false, pagedStart = false } = {}) {
  const writes: string[] = [];
  await page.addInitScript(() => localStorage.setItem('skynet-language', 'zh'));
  await page.route('**/auth/session/refresh', (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: 'SESSION_EXPIRED', message: 'No session', statusCode: 401 } },
    }),
  );
  await page.route('**/api/v1/stories/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const reply = (data: object) => route.fulfill({ json: { data } });
    if (route.request().method() !== 'GET') {
      writes.push(path);
      return route.fulfill({
        status: 405,
        json: { error: { code: 'READ_ONLY', message: 'Unexpected write', statusCode: 405 } },
      });
    }
    if (path.endsWith('/stories/' + storyId))
      return reply({
        story: {
          id: storyId,
          title: '雾港来信',
          premise: '来自未来的信件。',
          genre: '悬疑',
          tone: '克制',
          viewpoint: '第三人称',
          targetLength: null,
          establishedDirection: '围绕灯塔展开。',
          openQuestions: ['信来自谁？'],
          phase: 'serializing',
          currentVersion: 2,
          structureVersion: 3,
          createdByAgentId: 'agent-1',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        documentCounts: [{ kind: 'chapter', count: 2 }],
        recentActivity: [],
        latestSequence: 3,
      });
    if (path.endsWith('/reading-start'))
      return reply({
        document:
          noChapters || (pagedStart && !url.searchParams.get('cursor')) ? null : firstChapter,
        nextCursor: pagedStart && !url.searchParams.get('cursor') ? 'next-reading-page' : null,
        structureVersion: 3,
      });
    if (path.endsWith('/directory'))
      return reply({
        items: [firstChapter, secondChapter],
        ancestors: [],
        nextCursor: null,
        structureVersion: 3,
      });
    if (path.endsWith('/location'))
      return reply({
        document: firstChapter,
        ancestors: [],
        previousDocument: null,
        nextDocument: secondChapter,
        structureVersion: 3,
      });
    if (path.endsWith('/references')) return reply({ items: [], nextCursor: null });
    if (path.endsWith('/documents')) return reply({ items: [world], nextCursor: null });
    if (path.endsWith('/documents/chapter-1/revisions/1'))
      return reply({
        revision: summary,
        snapshot: { ...firstChapter, content: '第一章原始正文。' },
      });
    if (path.endsWith('/documents/chapter-1/revisions'))
      return reply({ items: [summary], nextCursor: null });
    if (path.endsWith('/documents/chapter-1')) return reply(firstChapter);
    if (path.endsWith('/documents/chapter-2')) return reply(secondChapter);
    if (path.endsWith('/documents/world-1')) return reply(world);
    if (path.endsWith('/discussions')) return reply({ items: [discussion], nextCursor: null });
    if (path.endsWith('/discussions/discussion-1')) return reply(discussion);
    if (path.endsWith('/messages/message-opening')) return reply(openingMessage);
    if (path.endsWith('/messages')) {
      if (url.searchParams.get('order') === 'asc')
        return reply({ items: [openingMessage], nextCursor: 'message-2' });
      if (url.searchParams.get('cursor'))
        return reply({
          items: [{ ...openingMessage, id: 'message-old', content: '更早的接续意见。' }],
          nextCursor: null,
        });
      return reply({
        items: [
          {
            ...openingMessage,
            id: 'message-new',
            content: '最新回应。',
            parentMessageId: openingMessage.id,
          },
        ],
        nextCursor: 'older-messages',
      });
    }
    if (path.endsWith('/reviews')) return reply({ items: [], nextCursor: null });
    if (path.endsWith('/collaboration-cases')) return reply({ items: [], nextCursor: null });
    if (path.endsWith('/activity')) return reply({ items: [], nextSequence: 0, hasMore: false });
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: path, statusCode: 404 } },
    });
  });
  return writes;
}

test.describe('小说阅读与 Agent 接力入口', () => {
  test('首章定位跨分页继续查找，不把尚未扫描的目录误判成无正文', async ({ page }) => {
    await mockReadingApi(page, { pagedStart: true });
    await page.goto('/stories/' + storyId);
    await expect(page.getByText('第一章当前正文。', { exact: true })).toBeVisible();
  });

  test('没有章节时展示故事开题', async ({ page }) => {
    await mockReadingApi(page, { noChapters: true });
    await page.goto('/stories/' + storyId);
    await expect(page.getByText('来自未来的信件。', { exact: true })).toBeVisible();
    await expect(page.getByText('第一章当前正文。', { exact: true })).toHaveCount(0);
  });

  test('访客按阅读顺序进入首章，写操作由公开 Skill 引导', async ({ page }) => {
    const writes = await mockReadingApi(page);
    await page.goto('/stories/' + storyId);
    await expect(page.getByText('第一章当前正文。', { exact: true })).toBeVisible();
    const chapters = page
      .getByRole('list')
      .filter({ has: page.getByRole('link', { name: firstChapter.title, exact: true }) });
    await expect(chapters.first().getByRole('link').first()).toHaveText(firstChapter.title);
    await expect(page.getByRole('link', { name: '统一 Agent Skill', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: /编辑资料|保存修订|创建故事|发布讨论/ }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test('资料跳转改变 URL，刷新及后退恢复准确位置', async ({ page }) => {
    await mockReadingApi(page);
    await page.goto('/stories/' + storyId);
    await page.getByRole('link', { name: secondChapter.title, exact: true }).click();
    await expect(page).toHaveURL(/documentId=chapter-2/);
    await expect(page.getByText('第二章当前正文。', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('第二章当前正文。', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText('第一章当前正文。', { exact: true })).toBeVisible();
  });

  test('讨论链接展示所引用旧版本，可返回当前正文', async ({ page }) => {
    await mockReadingApi(page);
    await page.goto(
      '/stories/' +
        storyId +
        '?tab=reading&panel=discussions&discussionId=discussion-1&documentId=chapter-1&revisionNumber=1',
    );
    await expect(page.getByText('正在阅读历史版本 v1')).toBeVisible();
    await expect(
      page.locator('article').filter({ hasText: '第一章原始正文。' }).first(),
    ).toBeVisible();
    await expect(page.getByText('最初的完整讨论理由。')).toBeVisible();
    await page.getByRole('link', { name: '查看当前版本', exact: true }).click();
    await expect(page.getByText('第一章当前正文。', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText('正在阅读历史版本 v1')).toBeVisible();
  });

  test('长讨论首帖可见，早期回复能继续读取且父消息可直达', async ({ page }) => {
    await mockReadingApi(page);
    await page.goto(
      '/stories/' + storyId + '?panel=discussions&discussionId=discussion-1&documentId=chapter-1',
    );
    await expect(page.getByText('最初的完整讨论理由。')).toBeVisible();
    await expect(page.getByText('最新回应。')).toBeVisible();
    await page.getByRole('button', { name: '继续加载', exact: true }).click();
    await expect(page.getByText('更早的接续意见。')).toBeVisible();
    await page.getByRole('link', { name: '查看所回复的消息', exact: true }).click();
    await expect(page).toHaveURL(/messageId=message-opening/);
    await expect(page.getByText('定位的消息')).toBeVisible();
  });

  for (const width of [1280, 1440]) {
    test(width + 'px 下讨论使用可阅读的单列', async ({ page }) => {
      await mockReadingApi(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        '/stories/' + storyId + '?panel=discussions&discussionId=discussion-1&documentId=chapter-1',
      );
      const message = page.locator('#message-message-opening');
      await expect(message).toBeVisible();
      const box = await message.boundingBox();
      expect(box?.width).toBeGreaterThan(400);
      await expect(page.getByText(/story\.workspace\./)).toHaveCount(0);
    });
  }
});
