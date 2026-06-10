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

Target file: `apps/web/src/app/api/admin/logs/route.ts`

## Findings (1)

### [P2] GET /api/admin/logs accepts arbitrary `action` substring with no length limit
- id: `logs-action-contains-no-cap` · category: performance
- location: `apps/web/src/app/api/admin/logs/route.ts:18`
- evidence:
```
const action = sp.get('action'); if (action) where.action = { contains: action };
```
- impact: action column has no GIN/trgm index. A malicious or careless user passes a huge string or wildcard-heavy substring; Postgres performs a full-table seq scan of activity_log on every page load. activity_log will be the largest table in the system within weeks.
- proposed fix: z.string().min(2).max(64) on action; ideally switch to startsWith (which an index can serve) and add an index `@@index([action])` already exists — but it's a b-tree, contains can't use it. Consider pg_trgm + GIN index if free-text search is required.