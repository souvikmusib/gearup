You are applying P2 quality fixes to gearup. Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup.
Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- PERMISSIONS enum: `packages/types/src/domain.ts` (import via `@gearup/types`)
- DB: `import { prisma } from '@/lib/prisma'`. For multi-step writes use `prisma.$transaction`.
- Errors: `handleApiError(err)` in `@/lib/errors`. `AppError(statusCode: number, message: string, code: string)` — note arg order: STATUS first.
- Activity log: `logActivity({ adminUserId, action, entityType, entityId, metadata, tx })` from `@/lib/activity-logger` (supports optional tx).
- Gold stock pattern: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts`.

Rules:
1. Read the file first.
2. Apply EVERY finding. P2 = quality (consistency, perf, ux, type-safety, dead-code) — no skipping.
3. Preserve unrelated code; no reformatting.
4. Imports: add what you need; don't remove used ones.
5. No backward-compat shims.

Return JSON: {"file":"...","applied":[...ids],"skipped":[{"id":"","reason":""}],"notes":"..."}.

Target file: `apps/web/src/lib/prisma.ts`

## Findings (1)

### [P2] Pooler tuning hardcoded to Supabase hostname — any other Postgres host gets default settings
- id: `prisma-pool-only-supabase` · category: config
- location: `apps/web/src/lib/prisma.ts:5-22`
- evidence:
```
const isSupabasePooler = url.hostname.includes('pooler.supabase.com');
if (!isSupabasePooler) return databaseUrl;
```
- impact: If the team moves to Neon/RDS/PlanetScale Postgres, the serverless connection-limit=1 fix silently disengages and Vercel functions exhaust connections.
- proposed fix: Trigger the pgbouncer/connection_limit logic on any URL with `pgbouncer=true` query or a documented env flag; log which mode is active at boot.