You are a senior Next.js / Prisma / TypeScript engineer applying audit fixes to the gearup codebase. GO-LIVE TOMORROW. Fixes must be surgical, correct, no regressions.

Repo root: /Users/sagnikmitra/Desktop/GitHub/gearup

## Context
- Next.js 14 App Router, Prisma 5 + Postgres, JWT auth.
- All admin routes use `requirePermission(req, PERMISSIONS.X)` from `apps/web/src/lib/auth.ts`. Permissions enum at `packages/types/src/auth.ts`.
- DB: `import { prisma } from '@/lib/prisma'`. Multi-table writes MUST use `prisma.$transaction(async (tx) => ...)`.
- Errors: `handleApiError(err)` in `apps/web/src/lib/errors.ts`. Throw `new AppError(code, msg, status)`.
- Activity log: `logActivity({adminUserId, action, entityType, entityId, metadata})` from `apps/web/src/lib/activity-logger.ts`.
- Gold pattern for race-free stock: `apps/web/src/app/api/admin/inventory/items/[id]/stock/route.ts` uses tx + `updateMany` with `gte` guard.

## Rules
1. **Read the file first** before editing.
2. **Apply EVERY finding** listed below. None are optional.
3. **Preserve unrelated code.** Don't reformat or refactor outside scope.
4. **Race-fixes**: use `prisma.$transaction` + conditional `updateMany({where:{...guard},data:...})` then assert `result.count === 1`, else throw `new AppError('CONFLICT', '...', 409)`.
5. **Permission fixes**: if a new PERMISSIONS.X is needed, the shared-infra agent has added/will add it to `packages/types/src/auth.ts`. Just import + use.
6. **Mass-assignment**: replace `data: body as any` with explicit field picks.
7. **No backward-compat shims** — fix it right.
8. **Imports**: add what you need; don't remove ones still used.
9. **Schema changes**: if a Zod schema changes, ensure all callers match.
10. **Don't run build** — coordinator does that.

## Verify after edit
Re-Read the file. Confirm syntax. Mention any cascading changes needed.

Return JSON only: {"file": "...", "applied": ["id1","id2"], "skipped": [{"id":"","reason":""}], "cascading_changes": ["path: note"], "notes": "2-5 sentences"}.

Target file: `apps/web/src/app/api/admin/workers/[id]/leave/route.ts`

## Findings to fix in this file (1)

### 1. [P1] PATCH /workers/[id]/leave APPROVED forces worker.status='ON_LEAVE' regardless of leave dates
- _id_: `worker-leave-approval-sets-status-blindly` · _category_: business-logic
- _location_: `apps/web/src/app/api/admin/workers/[id]/leave/route.ts:27-29`
- _evidence_:
```
const leave = await prisma.workerLeave.update({ where: { id: body.leaveId, workerId: params.id }, data: { status: body.status, approvedByAdminId: user.sub } });
if (body.status === 'APPROVED') await prisma.worker.update({ where: { id: params.id }, data: { status: 'ON_LEAVE' } });
```
- _impact_: Approving a leave for next month immediately flips the worker to ON_LEAVE today, removing them from the workers/calendar 'available' list and from worker filter dropdowns. Nothing flips them back to ACTIVE when the leave ends — manual cleanup forever.
- _proposed fix_: Only flip status if today is between startDate and endDate. Add a daily cron (or compute status dynamically from active leave) and revert when leave window passes.