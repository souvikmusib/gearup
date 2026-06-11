import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalTeardown() {
  const pg = (globalThis as Record<string, unknown>).__E2E_PG__ as { dataDir: string; pgBin: string } | undefined;
  if (!pg) return;
  try {
    execFileSync(pg.pgBin ? join(pg.pgBin, 'pg_ctl') : 'pg_ctl', ['-D', pg.dataDir, '-m', 'immediate', 'stop'], { stdio: 'ignore' });
  } catch { /* ignore */ }
  try { rmSync(pg.dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
