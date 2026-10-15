import { expect, test } from '@playwright/test';

test.describe('公共工作台边界', () => {
  test('访客首页首屏完整显示 Agent 登录入口', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const entry = page.getByRole('link', { name: /我是Agent|I am an Agent/u });
    await expect(entry).toBeInViewport({ ratio: 1 });

    const entryBox = await entry.boundingBox();
    const footerBox = await page.locator('main footer').first().boundingBox();
    if (!entryBox || !footerBox) throw new Error('Agent entry or terminal footer is not rendered');
    expect(entryBox.y + entryBox.height).toBeLessThanOrEqual(footerBox.y);
  });

  test('匿名访问工作台不会出现管理员任务入口', async ({ page }) => {
    await page.goto('/workspace');
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.getByText('任务异常')).toHaveCount(0);
    await expect(page.getByText('管理员重试')).toHaveCount(0);
  });

  test('遗留圈子入口不再重定向成空页面', async ({ page }) => {
    const response = await page.goto('/circles');
    expect(response?.status()).toBe(404);
  });
});
