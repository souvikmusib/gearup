/**
 * Vitest globalSetup for route-integration tests.
 *
 * Connects tests to a REAL Postgres (never mocked Prisma — this codebase relies
 * on raw SQL, transactions, Decimal, and P2002 catches that a mock would not
 * exercise).
 *
 * Resolution order for the test database:
 *   1. process.env.TEST_DATABASE_URL  — provided by CI (postgres service) or by
 *      the local `pnpm test:int` wrapper. Used as-is; schema is pushed onto it.
 *   2. Otherwise, spin an EPHEMERAL local Postgres (Homebrew pg17 / PATH) on a
 *      throwaway data dir + fixed port. This is a brand-new DB created
 *      milliseconds ago — `prisma db push --accept-data-loss` against it is NOT
 *      a destructive operation on any real data.
 *
 * If no Postgres is reachable AND no binaries are found, globalSetup throws with
 * a clear message; the integration vitest project is opt-in so the unit suite
 * (the CI hard gate) is unaffected.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXED_PORT = 54330;
const PG_CANDIDATES = [
  '/opt/homebrew/opt/postgresql@17/bin',
  '/usr/local/opt/postgresql@17/bin',
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/16/bin',
  '', // PATH
];

function findPgBin(): string | null {
  for (const dir of PG_CANDIDATES) {
    const initdb = dir ? join(dir, 'initdb') : 'initdb';
    const probe = spawnSync(initdb, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return dir;
  }
  return null;
}

let dataDir: string | null = null;
let pgBin = '';
let spunUp = false;

export async function setup() {
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    pgBin = findPgBin() ?? '';
    if (findPgBin() === null) {
      throw new Error(
        '[integration] No TEST_DATABASE_URL and no local Postgres binaries found. ' +
          'Set TEST_DATABASE_URL or install postgresql@17.',
      );
    }
    const bin = (name: string) => (pgBin ? join(pgBin, name) : name);
    dataDir = mkdtempSync(join(tmpdir(), 'gearup-itest-pg-'));
    const env = { ...process.env, LANG: 'C', LC_ALL: 'C' };

    execFileSync(bin('initdb'), ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8'], {
      stdio: 'ignore',
      env,
    });
    execFileSync(
      bin('pg_ctl'),
      ['-D', dataDir, '-o', `-p ${FIXED_PORT} -c listen_addresses=127.0.0.1 -c fsync=off`, '-w', '-l', join(dataDir, 'pg.log'), 'start'],
      { stdio: 'ignore', env },
    );
    execFileSync(bin('createdb'), ['-h', '127.0.0.1', '-p', String(FIXED_PORT), '-U', 'postgres', 'gearup_test'], {
      stdio: 'ignore',
      env,
    });
    url = `postgresql://postgres@127.0.0.1:${FIXED_PORT}/gearup_test`;
    spunUp = true;
  }

  process.env.TEST_DATABASE_URL = url;

  // Create the schema exactly as the live app expects. The target DB is either
  // an ephemeral throwaway or a CI service DB — never production.
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url, PRISMA_DISABLE_URL_TUNING: '1' },
  });

  // eslint-disable-next-line no-console
  console.log(`[integration] test DB ready: ${url.replace(/:\/\/[^@]*@/, '://***@')}`);
}

export async function teardown() {
  if (spunUp && dataDir) {
    try {
      execFileSync((pgBin ? join(pgBin, 'pg_ctl') : 'pg_ctl'), ['-D', dataDir, '-m', 'immediate', 'stop'], {
        stdio: 'ignore',
      });
    } catch {
      /* ignore */
    }
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export { existsSync }; // silence unused-import lint in some configs
