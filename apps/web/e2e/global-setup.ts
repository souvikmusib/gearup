/**
 * Playwright globalSetup: stand up a SEEDED test database (never production),
 * then let playwright's webServer boot the app against it.
 *
 * DB resolution:
 *   - E2E_DATABASE_URL (CI postgres service), else
 *   - an ephemeral local Postgres on a dedicated port (54331), isolated from
 *     the integration DB (54330) and from production.
 *
 * Sets process.env so the webServer (next) and the API-driven specs inherit the
 * test DB + a known JWT secret + the local base URL.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 54331;
const PG_DIRS = ['/opt/homebrew/opt/postgresql@17/bin', '/usr/local/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', ''];

function findPgBin(): string | null {
  for (const d of PG_DIRS) {
    if (spawnSync(d ? join(d, 'initdb') : 'initdb', ['--version'], { stdio: 'ignore' }).status === 0) return d;
  }
  return null;
}

export default async function globalSetup() {
  let url = process.env.E2E_DATABASE_URL;
  const g = globalThis as Record<string, unknown>;

  if (!url) {
    const pgBin = findPgBin();
    if (pgBin === null) throw new Error('[e2e] No E2E_DATABASE_URL and no local Postgres found.');
    const bin = (n: string) => (pgBin ? join(pgBin, n) : n);
    const dataDir = mkdtempSync(join(tmpdir(), 'gearup-e2e-pg-'));
    const env = { ...process.env, LANG: 'C', LC_ALL: 'C' };
    execFileSync(bin('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8'], { stdio: 'ignore', env });
    execFileSync(bin('pg_ctl'), ['-D', dataDir, '-o', `-p ${PORT} -c listen_addresses=127.0.0.1 -c fsync=off`, '-w', '-l', join(dataDir, 'pg.log'), 'start'], { stdio: 'ignore', env });
    execFileSync(bin('createdb'), ['-h', '127.0.0.1', '-p', String(PORT), '-U', 'postgres', 'gearup_e2e'], { stdio: 'ignore', env });
    url = `postgresql://postgres@127.0.0.1:${PORT}/gearup_e2e`;
    g.__E2E_PG__ = { dataDir, pgBin };
  }

  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.PRISMA_DISABLE_URL_TUNING = '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret-0123456789';
  process.env.E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100';

  const dbEnv = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], { stdio: 'inherit', env: dbEnv });
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'inherit', env: dbEnv });
  // eslint-disable-next-line no-console
  console.log('[e2e] seeded test DB ready');
}
