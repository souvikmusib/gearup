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

Target file: `apps/web/src/app/api/admin/workers/[id]/leave/route.ts`

## Findings (1)

### [P2] POST /workers/[id]/leave does not check overlap with existing leaves or open assignments
- id: `worker-leave-overlap-not-checked` · category: validation
- location: `apps/web/src/app/api/admin/workers/[id]/leave/route.ts:9-20`
- evidence:
```
const body = z.object({
  leaveType: z.string().min(1), startDate: z.string(), endDate: z.string(), reason: z.string().optional(),
}).parse(await req.json());
const leave = await prisma.workerLeave.create({ data: { workerId: params.id, leaveType: body.leaveType, startDate: new Date(body.startDate), endDate: new Date(body.endDate), reason: body.reason } });
```
- impact: Same worker can have 5 overlapping APPROVED leaves; endDate before startDate is accepted. Leave doesn't check appointments already assigned to that worker in the window.
- proposed fix: Validate endDate >= startDate. Refuse overlap with status in (PENDING,APPROVED). Warn if appointments exist in the window.