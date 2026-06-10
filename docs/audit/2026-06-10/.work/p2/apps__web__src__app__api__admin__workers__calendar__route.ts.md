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

Target file: `apps/web/src/app/api/admin/workers/calendar/route.ts`

## Findings (1)

### [P2] GET /workers/calendar returns at most 200 assignments with no filter, no date range
- id: `workers-calendar-take-200-no-pagination` · category: performance
- location: `apps/web/src/app/api/admin/workers/calendar/route.ts:13`
- evidence:
```
prisma.workerAssignment.findMany({ include: { worker: { select: { fullName: true } }, jobCard: { select: { jobCardNumber: true, status: true, intakeDate: true, estimatedDeliveryAt: true } } }, orderBy: { assignedAt: 'desc' }, take: 200 }),
```
- impact: Hardcoded take:200 silently truncates after the shop has even a few months of activity; calendar will look empty for older slots. No date-range query, so the page always over-fetches. No index on assignedAt either.
- proposed fix: Accept ?from=&to= query params, filter assignments by jobCard.intakeDate/estimatedDeliveryAt within range, drop take. Add index on WorkerAssignment(jobCardId, assignedAt) if hot.