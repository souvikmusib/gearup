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

Target file: `apps/web/src/lib/pagination.ts`

## Findings (1)

### [P2] paginate() caps pageSize at 500 — abusable on public/list routes for memory and DB load
- id: `pagination-bound-too-high` · category: performance
- location: `apps/web/src/lib/pagination.ts:1-5`
- evidence:
```
const take = Math.min(Math.max(pageSize, 1), 500);
```
- impact: Anyone hitting `?pageSize=500` (or just a misbehaving client) pulls 500-row joins on inventory/customers/jobCards which include heavy nested includes elsewhere. constants.ts even defines MAX_PAGE_SIZE = 100 — paginate() ignores it.
- proposed fix: Import and use MAX_PAGE_SIZE (100) from constants; require explicit opt-in for >100.