import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    include: ['test/integration/**/*.itest.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup.ts'],
    // Real DB → run serially in a single fork for deterministic state.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
