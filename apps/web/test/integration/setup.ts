/**
 * Per-worker setup for integration tests. Runs before any test module is
 * imported, so env is in place when `@/lib/prisma` first evaluates.
 */
import { vi } from 'vitest';

const FIXED_PORT = 54330;
const url =
  process.env.TEST_DATABASE_URL ||
  `postgresql://postgres@127.0.0.1:${FIXED_PORT}/gearup_test`;

process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.PRISMA_DISABLE_URL_TUNING = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
// NODE_ENV is typed read-only by @types/node; assign through the bag.
(process.env as Record<string, string>).NODE_ENV ||= 'test';

// Mock next/headers so route handlers' auth (getAuthToken) reads a token the
// test injects via globalThis.__TEST_AUTH_TOKEN__ (set by helpers.asRole()).
vi.mock('next/headers', () => ({
  headers: () => ({
    get: (k: string) => {
      const tok = (globalThis as Record<string, unknown>).__TEST_AUTH_TOKEN__ as string | undefined;
      return k.toLowerCase() === 'authorization' && tok ? `Bearer ${tok}` : null;
    },
  }),
  cookies: () => ({ get: () => undefined }),
}));
