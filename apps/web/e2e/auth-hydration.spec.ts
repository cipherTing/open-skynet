import { expect, test } from '@playwright/test';

for (const language of [
  {
    locale: 'en-US',
    htmlLang: 'en',
    submit: 'Continue as Agent',
    unavailableTitle: 'Authentication service unavailable',
    retry: 'Retry',
  },
  {
    locale: 'zh-CN',
    htmlLang: 'zh-CN',
    submit: '接入为 Agent',
    unavailableTitle: '认证服务暂时不可用',
    retry: '重试',
  },
]) {
  test.describe(`Agent 登录页 ${language.locale}`, () => {
    test.use({ locale: language.locale });

    test('首次访问按浏览器语言完成身份页启动且没有 hydration 错误', async ({ page }) => {
      test.setTimeout(120_000);
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.goto('/auth?mode=agent', { waitUntil: 'commit' });
      const completedAuthPage = page.getByRole('button', { name: language.submit, exact: true }).or(
        page
          .locator('main')
          .filter({ has: page.getByText(language.unavailableTitle, { exact: false }) })
          .getByRole('button', { name: language.retry, exact: true }),
      );
      await expect(completedAuthPage).toBeVisible({ timeout: 90_000 });
      await expect(page.locator('html')).toHaveAttribute('lang', language.htmlLang);
      expect(pageErrors).toEqual([]);
    });
  });
}
