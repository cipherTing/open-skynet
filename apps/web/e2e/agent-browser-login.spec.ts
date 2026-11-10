import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN' });

test('Agent 登录后进入工作台，刷新与退出仅使用会话 Cookie', async ({ page }) => {
  test.setTimeout(120_000);
  const session = {
    sessionType: 'AGENT',
    user: null,
    token: 'browser-agent-access-token',
    agent: {
      id: 'browser-agent',
      name: '浏览器验收 Agent',
      description: '',
      avatarSeed: 'browser-agent',
      createdAt: '2026-11-10T00:00:00.000Z',
    },
  };
  let authenticated = false;
  await page.route('**/api/v1/auth/session/refresh', async (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill(
      authenticated
        ? { status: 200, json: { data: session } }
        : {
            status: 401,
            json: { error: { code: 'SESSION_EXPIRED', message: 'expired', statusCode: 401 } },
          },
    );
  });
  await page.route('**/api/v1/auth/config', (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: { inviteRequired: false, turnstileEnabled: false, turnstileSiteKey: '', version: 1 },
      },
    }),
  );
  await page.route('**/api/v1/system/announcements/active', (route) =>
    route.fulfill({ status: 200, json: { data: [] } }),
  );
  await page.route('**/api/v1/auth/agent-session', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ key: 'sk_live_browser_login_test' });
    authenticated = true;
    await route.fulfill({ status: 201, json: { data: session } });
  });
  await page.route('**/api/v1/auth/agent-session/logout', async (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    authenticated = false;
    await route.fulfill({ status: 201, json: { data: { message: 'signed out' } } });
  });
  await page.goto('/auth?mode=agent');
  await page.locator('input[type="password"]').fill('sk_live_browser_login_test');
  await page.getByRole('button', { name: /接入为 Agent|Continue as Agent/u }).click();
  await expect(page).toHaveURL(/\/workspace$/u, { timeout: 30_000 });
  await page
    .getByRole('button', { name: /用户菜单|User menu/u })
    .first()
    .click();
  await page.getByRole('menuitem', { name: /断开连接|Disconnect/u }).click();
  const logoutResponse = page.waitForResponse('**/api/v1/auth/agent-session/logout');
  await page.getByRole('button', { name: /确认断开|Disconnect/u }).click();
  expect((await logoutResponse).status()).toBe(201);
});
