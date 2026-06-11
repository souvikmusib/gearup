import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Playwright specs live in e2e/ and run via @playwright/test, not vitest.
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
