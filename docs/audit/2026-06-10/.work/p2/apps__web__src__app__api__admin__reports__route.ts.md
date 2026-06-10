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

Target file: `apps/web/src/app/api/admin/reports/route.ts`

## Findings (2)

### [P2] Dashboard route runs 8 parallel queries on every hit with no cache hint
- id: `reports-dashboard-no-cache` · category: performance
- location: `apps/web/src/app/api/admin/reports/route.ts:26`
- evidence:
```
await Promise.all([... 8 queries incl. Customer/Vehicle counts ...])
```
- impact: Repeated counts on tables that don't change second-to-second; seq-scan risk as Customer/Vehicle grow.
- proposed fix: export const revalidate = 30, or unstable_cache keyed by minute; rely on reltuples for big tables.

### [P2] /reports?type=... duplicates the 6 dedicated /reports/<x> endpoints with subtly divergent shapes
- id: `reports-duplicate-endpoints` · category: tech-debt
- location: `apps/web/src/app/api/admin/reports/route.ts:145`
- evidence:
```
type=expenses returns byCategory keyed only by categoryId; /reports/expenses additionally joins categoryName.
```
- impact: Two code paths drift; front-end can pick either and get different fields. Same duplication for jobs/appointments/inventory/workers/revenue.
- proposed fix: Keep one source of truth — delete the type= branches or delete the dedicated routes.