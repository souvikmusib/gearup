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

Target file: `apps/web/src/app/api/admin/job-cards/[id]/tasks/route.ts`

## Findings (1)

### [P2] Task status field is free-form string in DB and accepted as z.string() in PATCH
- id: `jobcard-tasks-no-status-enum` · category: validation
- location: `apps/web/src/app/api/admin/job-cards/[id]/tasks/route.ts:29-32`
- evidence:
```
const body = z.object({
  taskId: z.string(), status: z.string().optional(), taskName: z.string().optional(),
  assignedWorkerId: z.string().nullable().optional(), actualMinutes: z.number().optional(),
}).parse(await req.json());
```
- impact: UI uses PENDING/IN_PROGRESS/DONE but the DB column is String (not enum) and the API accepts anything. Typos break the StatusBadge color mapping and analytics queries that group by task.status.
- proposed fix: Either migrate to an enum (recommended) or z.enum(['PENDING','IN_PROGRESS','DONE','BLOCKED','SKIPPED']) in both POST and PATCH. Same applies to JobCardTask creation (line 18 forces 'PENDING' fine).