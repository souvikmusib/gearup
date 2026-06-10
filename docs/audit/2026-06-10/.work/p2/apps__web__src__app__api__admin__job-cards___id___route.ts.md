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

Target file: `apps/web/src/app/api/admin/job-cards/[id]/route.ts`

## Findings (1)

### [P2] None of these admin routes enforce a tenant/organization scope on the queried entities
- id: `jobcard-no-tenant-scope` · category: auth
- location: `apps/web/src/app/api/admin/job-cards/[id]/route.ts:9-15`
- evidence:
```
requireAnyPermission(PERMISSIONS.JOB_CARDS_CREATE, PERMISSIONS.JOB_CARDS_VIEW_OWN);
const jc = await prisma.jobCard.findUniqueOrThrow({ where: { id: params.id }, include: { ... } });
```
- impact: PERMISSIONS.JOB_CARDS_VIEW_OWN suggests an 'own' scope is intended, but the route doesn't filter by createdById/assignedTo. A user with VIEW_OWN can read any job card if they know the id. Same for parts/tasks/workers routes — they only check the user can act on job cards in general, never that this particular jobCardId belongs to them.
- proposed fix: For VIEW_OWN, AND a clause like { OR: [{ createdById: user.sub }, { assignments: { some: { workerId: user.workerId } } }] }. For mutating routes that should be scoped, verify ownership before mutating.