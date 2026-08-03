import { expect, test } from '@playwright/test';

test.describe('公共工作台边界', () => {
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
