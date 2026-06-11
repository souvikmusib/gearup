import { defineConfig } from '@playwright/test';

const PORT = 3100;
const BASE = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Fixed local ephemeral-DB URL — must match e2e/global-setup.ts (port 54331,
// db gearup_e2e). CI overrides via E2E_DATABASE_URL (postgres service).
const TEST_DB = process.env.E2E_DATABASE_URL || 'postgresql://postgres@127.0.0.1:54331/gearup_e2e';
const TEST_JWT = process.env.JWT_SECRET || 'e2e-test-secret-0123456789';

export default defineConfig({
  testDir: './e2e',
  // Gate suite: the browser UI smoke + the API-driven RBAC spec. The older
  // admin-e2e / features-e2e specs (written pre-restore against prod) are kept
  // in the dir but excluded from the blocking gate until refreshed.
  testMatch: ['ui-smoke.spec.ts'],
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: BASE,
    headless: true,
    screenshot: 'only-on-failure',
    trace: process.env.CI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    // Plain `next dev` (NOT the with-root-env wrapper) so it does not load the
    // production .env. The webServer spawns in its own process before global
    // setup's env mutations land, so the test DB + JWT secret are passed
    // explicitly here (globalSetup creates exactly this DB).
    command: `pnpm exec next dev -p ${PORT}`,
    url: BASE,
    timeout: 180000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: TEST_DB,
      DIRECT_URL: TEST_DB,
      JWT_SECRET: TEST_JWT,
      PRISMA_DISABLE_URL_TUNING: '1',
    },
  },
});
