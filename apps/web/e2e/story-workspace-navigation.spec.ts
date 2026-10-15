import { expect, test, type Page } from '@playwright/test';

const storyId = 'story-workspace-navigation-fixture';

const worldSnapshot = {
  kind: 'world_setting',
  title: '雾港规则',
  branchId: null,
  links: [{ targetDocumentId: 'document-outline', relation: 'references' }],
};

const worldDocument = {
  id: 'document-world',
  storyId,
  ...worldSnapshot,
  content: '雾港的潮汐每天提前一小时。',
  currentVersion: 2,
  createdByAgentId: 'agent-editor',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-14T10:00:00.000Z',
};

const workspaceDocuments = [
  {
    id: 'document-world',
    storyId,
    ...worldSnapshot,
    currentVersion: 2,
    createdByAgentId: 'agent-editor',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-14T10:00:00.000Z',
  },
  {
    id: 'document-outline',
    storyId,
    kind: 'outline',
    title: '故事大纲',
    branchId: null,
    links: [],
    currentVersion: 1,
    createdByAgentId: 'agent-editor',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  {
    id: 'document-volume',
    storyId,
    kind: 'volume',
    title: '第一卷',
    branchId: null,
    links: [],
    currentVersion: 1,
    createdByAgentId: 'agent-editor',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  {
    id: 'document-chapter',
    storyId,
    kind: 'chapter',
    title: '第一章：潮汐',
    branchId: null,
    links: [{ targetDocumentId: 'document-volume', relation: 'part_of' }],
    currentVersion: 1,
    createdByAgentId: 'agent-editor',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
  {
    id: 'document-branch-chapter',
    storyId,
    kind: 'chapter',
    title: '另一条路线：潮汐',
    branchId: 'branch-alternate-ending',
    links: [],
    currentVersion: 1,
    createdByAgentId: 'agent-editor',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  },
];

const alternateBranch = {
  id: 'branch-alternate-ending',
  storyId,
  title: '灯塔结局',
  premise: '信件带领主角走向灯塔。',
  sourceDocumentId: 'document-chapter',
  sourceRevisionNumber: 1,
  createdByAgentId: 'agent-editor',
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};

const linkedDiscussion = {
  id: 'discussion-branch-target',
  storyId,
  documentId: 'document-branch-chapter',
  revisionNumber: 1,
  branchId: 'branch-alternate-ending',
  anchorText: '潮汐指向旧灯塔。',
  title: '灯塔路线的讨论',
  noticeTargetAgentId: 'agent-target',
  createdByAgentId: 'agent-editor',
  createdAt: '2026-10-14T10:00:00.000Z',
};

const restrictionDiscussion = {
  ...linkedDiscussion,
  id: 'discussion-mainline-target',
  documentId: 'document-world',
  revisionNumber: 2,
  branchId: null,
  anchorText: '雾港的潮汐每天提前一小时。',
  title: '潮汐规则的讨论',
};

const laterConflict = {
  id: 'conflict-after-notice',
  storyId,
  documentId: restrictionDiscussion.documentId,
  revisionNumbers: [2, 3, 4, 5],
  actorAgentIds: ['agent-target', 'agent-editor'],
  createdAt: '2026-10-14T10:05:00.000Z',
};

const worldRevision = {
  id: 'revision-world-2',
  storyId,
  documentId: 'document-world',
  targetType: 'document',
  revisionNumber: 2,
  baseVersion: 1,
  authorAgentId: 'agent-editor',
  changeSummary: '补充潮汐规则',
  diff: {
    beforeStory: null,
    afterStory: null,
    beforeDocument: { ...worldSnapshot, content: '雾港的潮汐每天提前半小时。' },
    afterDocument: { ...worldSnapshot, content: '雾港的潮汐每天提前一小时。' },
  },
  createdAt: '2026-10-14T10:00:00.000Z',
  title: '雾港规则',
  branchId: null,
};

const worldActivity = {
  id: 'revision-world-2',
  storyId,
  documentId: 'document-world',
  targetType: 'document',
  revisionNumber: 2,
  baseVersion: 1,
  authorAgentId: 'agent-editor',
  changeSummary: '补充潮汐规则',
  createdAt: '2026-10-14T10:00:00.000Z',
  title: '雾港规则',
  branchId: null,
};

async function mockWorkspaceApi(
  page: Page,
  {
    agentSession = false,
    pagedDocuments = false,
    omitTargetDiscussion = false,
    omitTargetDocument = false,
    failCollaboration = false,
    pagedRevisions = false,
    failDocumentDirectory = false,
  } = {},
) {
  await page.addInitScript(() => localStorage.setItem('skynet-language', 'zh'));
  await page.route('**/auth/session/refresh', (route) =>
    agentSession
      ? route.fulfill({
          json: {
            data: {
              sessionType: 'AGENT',
              user: null,
              agent: {
                id: 'agent-test',
                name: '测试 Agent',
                description: '',
                avatarSeed: 'agent-test',
                ownerOperationEnabled: false,
                createdAt: '2026-10-10T10:00:00.000Z',
              },
              token: 'agent-test-token',
            },
          },
        })
      : route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'SESSION_EXPIRED', message: 'No browser session', statusCode: 401 },
          }),
        }),
  );
  await page.route('**/api/v1/notifications**', (route) =>
    route.fulfill({
      json: { data: { items: [], nextCursor: null, unread: { total: 0, mentions: 0 } } },
    }),
  );
  await page.route(`**/api/v1/stories/${storyId}**`, async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let payload: unknown;

    if (pathname.endsWith(`/stories/${storyId}`)) {
      payload = {
        story: {
          id: storyId,
          title: '雾港来信',
          premise: '一座海港收到来自未来的信。',
          genre: '悬疑',
          tone: '克制',
          viewpoint: '第三人称',
          targetLength: null,
          establishedDirection: null,
          openQuestions: ['来信来自谁？'],
          phase: 'serializing',
          currentVersion: 2,
          createdAt: '2026-10-10T10:00:00.000Z',
          updatedAt: '2026-10-14T10:00:00.000Z',
          createdByAgentId: 'agent-editor',
        },
        documentCounts: [
          { kind: 'world_setting', count: 1 },
          { kind: 'outline', count: 1 },
          { kind: 'volume', count: 1 },
          { kind: 'chapter', count: 1 },
        ],
        recentActivity: [worldActivity],
      };
    } else if (pathname.endsWith(`/stories/${storyId}/documents`)) {
      if (failDocumentDirectory) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable', statusCode: 503 },
          }),
        });
        return;
      }
      const cursor = url.searchParams.get('cursor');
      const documentIds = url.searchParams.getAll('documentIds');
      if (documentIds.length) {
        payload = {
          items: workspaceDocuments.filter((document) => documentIds.includes(document.id)),
          nextCursor: null,
        };
      } else if (url.searchParams.get('q')?.includes('灯塔')) {
        payload = {
          items: [
            {
              ...workspaceDocuments[0],
              id: 'document-old-51',
              title: '旧资料：灯塔来信',
            },
          ],
          nextCursor: null,
        };
      } else if (url.searchParams.get('branchId') === alternateBranch.id) {
        payload = {
          items: omitTargetDocument
            ? []
            : [workspaceDocuments.find((document) => document.id === 'document-branch-chapter')],
          nextCursor: null,
        };
      } else if (pagedDocuments && cursor === 'document-page-2') {
        payload = {
          items: [
            {
              ...workspaceDocuments[0],
              id: 'document-world-51',
              title: '第五十一份世界设定',
            },
          ],
          nextCursor: null,
        };
      } else if (pagedDocuments) {
        const firstPage = Array.from({ length: 50 }, (_, index) => ({
          ...workspaceDocuments[0],
          id: `document-world-${index + 1}`,
          title: `世界设定 ${index + 1}`,
        }));
        payload = { items: firstPage, nextCursor: 'document-page-2' };
      } else {
        payload = { items: workspaceDocuments, nextCursor: null };
      }
    } else if (
      pathname.includes(`/stories/${storyId}/documents/`) &&
      !pathname.endsWith('/revisions') &&
      !pathname.endsWith('/restore')
    ) {
      const documentId = pathname.split('/').at(-1);
      const summary = workspaceDocuments.find((document) => document.id === documentId);
      payload = {
        ...(summary ?? workspaceDocuments[0]),
        ...(documentId === 'document-world'
          ? { ...worldDocument, ...(pagedRevisions ? { currentVersion: 100 } : {}) }
          : {}),
        id: documentId,
        ...(documentId === 'document-old-51' ? { title: '旧资料：灯塔来信' } : {}),
        content:
          documentId === 'document-world'
            ? worldDocument.content
            : documentId === 'document-outline'
              ? '第一卷从一封来信开始。'
              : documentId === 'document-volume'
                ? ''
                : documentId === 'document-chapter'
                  ? '信在凌晨送到。'
                  : '潮汐指向旧灯塔。',
      };
    } else if (pathname.endsWith(`/stories/${storyId}/revisions/compare`)) {
      const fromRevisionNumber = Number(route.request().postDataJSON().fromRevisionNumber);
      payload = {
        fromRevision: {
          ...worldRevision,
          id: `revision-world-${fromRevisionNumber}`,
          revisionNumber: fromRevisionNumber,
          diff: {
            ...worldRevision.diff,
            afterDocument: {
              ...worldRevision.diff.beforeDocument,
              content: '雾港的潮汐每天提前半小时。',
            },
          },
        },
        toRevision: worldRevision,
        changes: [
          {
            field: 'content',
            before: '雾港的潮汐每天提前半小时。',
            after: '雾港的潮汐每天提前一小时。',
          },
        ],
      };
    } else if (pathname.endsWith(`/stories/${storyId}/documents/document-world/revisions`)) {
      const cursor = url.searchParams.get('cursor');
      payload = pagedRevisions
        ? cursor === 'revision-page-2'
          ? {
              items: [{ ...worldActivity, revisionNumber: 50, id: 'revision-world-50' }],
              nextCursor: null,
            }
          : {
              items: Array.from({ length: 50 }, (_, index) => ({
                ...worldActivity,
                id: `revision-world-${100 - index}`,
                revisionNumber: 100 - index,
              })),
              nextCursor: 'revision-page-2',
            }
        : { items: [worldRevision], nextCursor: null };
    } else if (
      pathname.includes(`/stories/${storyId}/documents/`) &&
      pathname.endsWith('/revisions')
    ) {
      payload = { items: [], nextCursor: null };
    } else if (pathname.endsWith(`/stories/${storyId}/revisions`)) {
      payload = { items: [], nextCursor: null };
    } else if (pathname.endsWith(`/stories/${storyId}/discussions`)) {
      payload = {
        items: omitTargetDiscussion ? [] : [linkedDiscussion, restrictionDiscussion],
        nextCursor: null,
      };
    } else if (pathname.endsWith(`/stories/${storyId}/discussions/missing-discussion`)) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'STORY_DISCUSSION_NOT_FOUND',
            message: 'Discussion not found',
            statusCode: 404,
          },
        }),
      });
      return;
    } else if (pathname.endsWith(`/stories/${storyId}/discussions/${linkedDiscussion.id}`)) {
      payload = linkedDiscussion;
    } else if (
      pathname.endsWith(`/stories/${storyId}/discussions/${linkedDiscussion.id}/messages`)
    ) {
      payload = {
        items: [
          {
            id: 'discussion-message-1',
            storyId,
            discussionId: linkedDiscussion.id,
            parentMessageId: null,
            authorAgentId: 'agent-editor',
            content: '这条路线的潮汐与主线设定不同。',
            createdAt: '2026-10-14T10:01:00.000Z',
          },
        ],
        nextCursor: null,
      };
    } else if (pathname.endsWith(`/stories/${storyId}/branches`)) {
      payload = { items: [alternateBranch], nextCursor: null };
    } else if (pathname.endsWith(`/stories/${storyId}/reviews`)) {
      payload = { items: [], nextCursor: null };
    } else if (pathname.endsWith(`/stories/${storyId}/conflicts`) && failCollaboration) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable', statusCode: 503 },
        }),
      });
      return;
    } else if (pathname.endsWith(`/stories/${storyId}/collaboration-cases`) && failCollaboration) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable', statusCode: 503 },
        }),
      });
      return;
    } else if (pathname.endsWith(`/stories/${storyId}/conflicts`)) {
      payload = { items: [laterConflict], nextCursor: null };
    } else if (pathname.endsWith(`/stories/${storyId}/collaboration-cases`)) {
      payload =
        route.request().method() === 'POST'
          ? {
              id: 'restriction-case-1',
              storyId,
              caseType: 'WRITE_RESTRICTION',
              status: 'OPEN',
              documentId: restrictionDiscussion.documentId,
              revisionNumber: null,
              targetAgentId: 'agent-test',
              noticeDiscussionId: restrictionDiscussion.id,
              laterConflictId: laterConflict.id,
              evidence: [],
              parentCaseId: null,
              reason: '通知后仍在同一资料发生冲突',
              createdByAgentId: 'agent-editor',
              createdAt: '2026-10-14T10:10:00.000Z',
              resolvedAt: null,
              restrictionExpiresAt: null,
              votes: [],
            }
          : { items: [], nextCursor: null };
    } else {
      throw new Error(`Unexpected story API request: ${pathname}`);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: payload }),
    });
  });
}

test.describe('小说工作台导航', () => {
  test('用三个主入口浏览统一资料树和章节层级', async ({ page }) => {
    await mockWorkspaceApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl());

    const navigation = page.getByRole('tablist', { name: '故事工作台导航' });
    await expect(navigation.getByRole('tab')).toHaveText(['总览', '创作', '协作与复核']);

    await navigation.getByRole('tab', { name: '创作' }).click();
    await expect(page.getByRole('button', { name: /雾港规则/u })).toBeVisible();
    await expect(page.getByRole('button', { name: '故事大纲 大纲', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /第一章：潮汐/u })).toBeVisible();

    const chapter = page.getByRole('button', { name: /第一章：潮汐/u });
    await expect(chapter.locator('xpath=../../..')).toContainText('第一卷');
  });

  test('从协作活动打开对应资料的准确修订上下文', async ({ page }) => {
    await mockWorkspaceApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl());

    const navigation = page.getByRole('tablist', { name: '故事工作台导航' });
    await navigation.getByRole('tab', { name: '协作与复核' }).click();
    await expect(page.getByRole('button', { name: /补充潮汐规则/u })).toBeVisible();
    await page.getByRole('button', { name: /补充潮汐规则/u }).click();

    await expect(navigation.getByRole('tab', { name: '创作' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('活动修订')).toBeVisible();
    await expect(page.getByText('v2', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('补充潮汐规则', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('雾港的潮汐每天提前一小时。').first()).toBeVisible();
  });

  test('从 Agent 通知深链读取讨论并切换到讨论所属路线', async ({ page }) => {
    await mockWorkspaceApi(page, {
      agentSession: true,
      omitTargetDiscussion: true,
      omitTargetDocument: true,
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    const targetMessagesRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(
        `/stories/${storyId}/discussions/${linkedDiscussion.id}/messages`,
      ),
    );
    const targetDocumentRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(
        `/stories/${storyId}/documents/${linkedDiscussion.documentId}`,
      ),
    );
    await page.goto(
      workspaceUrl({
        documentId: linkedDiscussion.documentId,
        discussionId: linkedDiscussion.id,
      }),
    );

    await expect(page.getByRole('link', { name: '小说共创说明' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '平行剧情路线' })).toHaveValue(
      alternateBranch.id,
    );
    await expect(page.getByText('灯塔路线的讨论', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('这条路线的潮汐与主线设定不同。')).toBeVisible();
    await expect(targetMessagesRequest).resolves.toBeTruthy();
    await expect(targetDocumentRequest).resolves.toBeTruthy();
    await expect(page.getByRole('button', { name: '编辑资料' })).toBeVisible();
  });

  test('Agent Session 默认打开创作视图并展示小说 Skill 入口', async ({ page }) => {
    await mockWorkspaceApi(page, { agentSession: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl());

    const navigation = page.getByRole('tablist', { name: '故事工作台导航' });
    await expect(navigation.getByRole('tab', { name: '创作' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('link', { name: '小说共创说明' })).toBeVisible();
    await expect(page.getByRole('button', { name: /雾港规则/u })).toBeVisible();
    await expect(page.getByRole('link', { name: '小说共创说明' })).toHaveAttribute(
      'href',
      'https://raw.githubusercontent.com/cipherTing/open-skynet/main/skills/skynet/references/novel.md',
    );
    await expect(page.getByRole('link', { name: '统一 Agent Skill 入口' })).toHaveAttribute(
      'href',
      'https://raw.githubusercontent.com/cipherTing/open-skynet/main/skills/skynet/SKILL.md',
    );
  });

  test('默认阅读选中资料全文，协作接口失败只影响协作面板', async ({ page }) => {
    await mockWorkspaceApi(page, { failCollaboration: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const fullDocumentRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith(`/stories/${storyId}/documents/document-world`),
    );
    await page.goto(workspaceUrl());

    await expect(page.getByText('雾港的潮汐每天提前一小时。', { exact: true })).toBeVisible();
    await expect(fullDocumentRequest).resolves.toBeTruthy();
    await page.getByRole('tab', { name: '协作与复核' }).click();
    await expect(page.getByText('读取冲突记录失败')).toBeVisible();
    await expect(page.getByRole('tab', { name: '创作' })).toBeEnabled();
    await page.getByRole('tab', { name: '创作' }).click();
    await expect(page.getByText('雾港的潮汐每天提前一小时。', { exact: true })).toBeVisible();
  });

  test('资料目录失败时仍可按已知 ID 读取正文', async ({ page }) => {
    await mockWorkspaceApi(page, { failDocumentDirectory: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl({ documentId: 'document-world' }));

    await expect(page.getByRole('heading', { name: '雾港来信' })).toBeVisible();
    await expect(page.getByText('读取资料目录失败。')).toBeVisible();
    await expect(page.getByText('雾港的潮汐每天提前一小时。', { exact: true })).toBeVisible();
  });

  test('深链讨论不存在时显示讨论错误而不是故事不存在', async ({ page }) => {
    await mockWorkspaceApi(page, { agentSession: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl({ discussionId: 'missing-discussion' }));

    await expect(page.getByText('没有找到这条讨论，或它不属于这部故事。').first()).toBeVisible();
  });

  test('限写提案引用通知讨论和之后的同资料冲突，不让提案人选择时长', async ({ page }) => {
    await mockWorkspaceApi(page, { agentSession: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl());

    await page.getByRole('tab', { name: '协作与复核' }).click();
    await page.locator('details').nth(1).locator('summary').click();
    await page.getByLabel('已发送通知的讨论').selectOption(restrictionDiscussion.id);
    await page.getByLabel('通知后的同资料冲突').selectOption(laterConflict.id);
    await page.getByLabel('说明理由').last().fill('通知后仍在同一资料发生冲突');

    await expect(page.getByLabel('建议限制时长')).toHaveCount(0);
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname.endsWith(`/stories/${storyId}/collaboration-cases`),
    );
    await page.getByRole('button', { name: '提交限制建议' }).click();
    const request = await requestPromise;
    expect(request.postDataJSON()).toEqual({
      caseType: 'WRITE_RESTRICTION',
      targetAgentId: 'agent-target',
      documentId: restrictionDiscussion.documentId,
      noticeDiscussionId: restrictionDiscussion.id,
      laterConflictId: laterConflict.id,
      reason: '通知后仍在同一资料发生冲突',
    });
  });

  test('目录有后续页时可以继续加载并访问第 51 份资料', async ({ page }) => {
    await mockWorkspaceApi(page, { pagedDocuments: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl());
    await page.getByRole('tab', { name: '创作' }).click();

    await expect(page.getByRole('button', { name: /世界设定 50/u })).toBeVisible();
    await page.getByRole('button', { name: '加载更多资料' }).click();
    await expect(page.getByRole('button', { name: /第五十一份世界设定/u })).toBeVisible();
  });

  test('修订历史可继续读取更早版本', async ({ page }) => {
    await mockWorkspaceApi(page, { pagedRevisions: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl());
    await page.getByRole('button', { name: '修订历史' }).last().click();

    await expect(page.getByText('v100', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '加载更多修订历史' }).click();
    await expect(page.getByText('v50', { exact: true }).first()).toBeVisible();
  });

  test('标题搜索能直接定位第 51 份资料并按需读取正文', async ({ page }) => {
    await mockWorkspaceApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const searchRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        url.pathname.endsWith(`/stories/${storyId}/documents`) &&
        url.searchParams.get('q') === '灯塔'
      );
    });
    await page.goto(workspaceUrl());

    await page.getByRole('searchbox', { name: '搜索故事资料' }).fill('灯塔');
    await expect(page.getByRole('button', { name: /旧资料：灯塔来信/u })).toBeVisible();
    await expect(searchRequest).resolves.toBeTruthy();
    await page.getByRole('button', { name: /旧资料：灯塔来信/u }).click();
    await expect(page.getByText('潮汐指向旧灯塔。', { exact: true })).toBeVisible();
  });

  test('主文旁显示关联资料，点击后读取对应全文', async ({ page }) => {
    await mockWorkspaceApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(workspaceUrl());

    const related = page.getByRole('button', { name: '故事大纲 大纲 → references', exact: true });
    await expect(related).toBeVisible();
    await related.click();
    await expect(page.getByText('第一卷从一封来信开始。', { exact: true })).toBeVisible();
  });
});

function workspaceUrl(query: Record<string, string> = {}) {
  const baseUrl = process.env.STORY_WORKSPACE_TEST_BASE_URL ?? 'http://localhost:8080';
  const url = new URL(`/stories/${storyId}`, baseUrl);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}
