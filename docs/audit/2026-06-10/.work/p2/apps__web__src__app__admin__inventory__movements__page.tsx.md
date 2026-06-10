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

Target file: `apps/web/src/app/admin/inventory/movements/page.tsx`

## Findings (1)

### [P2] Movements + low-stock pages do not render pagination — first 50 movements only
- id: `movements-page-no-pagination-ui` · category: ux
- location: `apps/web/src/app/admin/inventory/movements/page.tsx`
- evidence:
```
useEffect(() => {
  const { cached, promise } = api.getSWR<any>('/admin/inventory/movements');
  ...
}, []);
```
- impact: API returns pageSize=50 by default with paginationMeta in the response, but the UI ignores meta entirely. Older movements are unreachable in the admin UI.
- proposed fix: Add Pagination component (already used in items page); pass &page= to api.getSWR; honor res.meta.totalPages.