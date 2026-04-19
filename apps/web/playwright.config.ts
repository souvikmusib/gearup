import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/test-results.json' }]],
  use: {
    baseURL: 'https://gearup.sgnk.ai',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
});
