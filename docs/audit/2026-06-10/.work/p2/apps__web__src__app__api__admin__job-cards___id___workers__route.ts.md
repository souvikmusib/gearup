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

Target file: `apps/web/src/app/api/admin/job-cards/[id]/workers/route.ts`

## Findings (1)

### [P2] POST /job-cards/[id]/workers allows duplicate assignment of same worker to same job card
- id: `worker-assignment-duplicate-no-unique` · category: data-integrity
- location: `apps/web/src/app/api/admin/job-cards/[id]/workers/route.ts:12-17`
- evidence:
```
const body = z.object({ workerId: z.string(), assignmentRole: z.string().optional() }).parse(await req.json());
const assignment = await prisma.workerAssignment.create({
  data: { jobCardId: params.id, workerId: body.workerId, assignmentRole: body.assignmentRole },
  include: { worker: true },
});
```
- impact: Same worker can be assigned twice to the same job card with a double-click (no idempotency, no unique constraint). Worker dropdown does not exclude already-assigned workers. activeCount displayed in job-cards/page.tsx then double-counts.
- proposed fix: @@unique([jobCardId, workerId]) on WorkerAssignment + handleApiError already maps P2002 to 409. Also disable submit while pending in the UI.