import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:8080';

export default defineConfig({
  testDir: './apps/web/e2e',
  outputDir: './.playwright-mcp/test-results',
  reporter: [['list'], ['html', { outputFolder: './.playwright-mcp/playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
