import { expect, test } from '@playwright/test';

test('帖子编辑器展示所选圈子的简介和规则', async ({ page }) => {
  const circle = {
    id: 'circle-story-lab',
    slug: 'story-lab',
    name: '故事实验室',
    topic: '讨论叙事方式、人物塑造与小说创作。',
    memberCount: 12,
    postCount: 8,
    lastPostAt: null,
    kind: 'NORMAL',
    status: 'ACTIVE',
    rules: [{ id: 'rule-1', text: '帖子应围绕小说创作展开。' }],
    topicVersion: 1,
    topicOrigin: 'CREATION',
    rulesVersion: 1,
    agentPostingEnabled: true,
    agentReplyingEnabled: true,
    postingPolicyVersion: 1,
    activeProposalCount: 0,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
  };

  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/auth/session/refresh')) {
      await route.fulfill({
        json: {
          data: {
            sessionType: 'AGENT',
            user: null,
            agent: {
              id: 'agent-test',
              name: '测试 Agent',
              description: '',
              avatarSeed: 'agent-test',
              ownerOperationEnabled: true,
              createdAt: '2026-10-15T00:00:00.000Z',
            },
            token: 'agent-test-token',
          },
        },
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/forum/posts')) {
      await route.fulfill({ json: { data: { items: [], nextCursor: null } } });
      return;
    }

    if (requestUrl.pathname.endsWith('/circles/slug/story-lab')) {
      await route.fulfill({ json: { data: circle } });
      return;
    }

    if (requestUrl.pathname.endsWith('/circles/circle-story-lab/panel')) {
      await route.fulfill({
        json: {
          data: {
            todayPostCount: 0,
            latestPosts: [],
            activeProposals: [],
            activeGovernanceCases: [],
          },
        },
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/system/announcements/active')) {
      await route.fulfill({ json: { data: [] } });
      return;
    }

    if (requestUrl.pathname.endsWith('/forum/welcome-summary')) {
      await route.fulfill({
        json: {
          data: {
            agentsTotal: 1,
            postsTotal: 0,
            circlesTotal: 1,
            events: [],
            asOf: '2026-10-15T00:00:00.000Z',
            refreshAfter: '2026-10-15T00:01:00.000Z',
          },
        },
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/forum/post-panel')) {
      const metric = {
        value: 0,
        asOf: '2026-10-15T00:00:00.000Z',
        refreshAfter: '2026-10-15T00:01:00.000Z',
      };
      await route.fulfill({
        json: {
          data: {
            dayKey: '2026-10-15',
            generatedAt: '2026-10-15T00:00:00.000Z',
            postsToday: metric,
            activeAgentsToday: metric,
            latestPosts: { items: [], asOf: metric.asOf, refreshAfter: metric.refreshAfter },
          },
        },
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/notifications')) {
      await route.fulfill({
        json: { data: { items: [], nextCursor: null, unread: { total: 0, mentions: 0 } } },
      });
      return;
    }

    if (requestUrl.pathname.endsWith('/users/me/agent/progression')) {
      await route.fulfill({
        json: {
          data: {
            level: {
              level: 1,
              name: '新 Agent',
              xpTotal: 0,
              currentLevelMinXp: 0,
              nextLevelXp: 100,
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
              settledAt: '2026-10-15T00:00:00.000Z',
            },
            dailyTasks: {
              remainingCount: 0,
              totalCount: 0,
              resetAt: '2026-10-16T00:00:00.000Z',
              items: [],
            },
          },
        },
      });
      return;
    }

    await route.fulfill({ json: { data: {} } });
  });

  await page.addInitScript(() => localStorage.setItem('skynet-language', 'zh'));
  await page.goto('/circles/story-lab');
  const createPostButton = page.getByRole('button', { name: '发布帖子' });
  await expect(createPostButton).toBeVisible();
  await createPostButton.click();

  const circleContext = page.getByRole('group', { name: '圈子讨论语境' });
  await expect(circleContext).toContainText(circle.topic);
  await expect(circleContext).toContainText('帖子应围绕小说创作展开。');
});
