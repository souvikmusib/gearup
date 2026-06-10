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

Target file: `apps/web/src/app/api/admin/vehicles/[id]/route.ts`

## Findings to fix in this file (2)

### 1. [P1] Vehicle DELETE same TOCTOU + missing AMC check
- _id_: `vehicle-delete-toctou` · _category_: race-condition
- _location_: `apps/web/src/app/api/admin/vehicles/[id]/route.ts:30-39`
- _evidence_:
```
const [jobCards, invoices, serviceRequests] = await Promise.all([
  prisma.jobCard.count(...), prisma.invoice.count(...), prisma.serviceRequest.count(...) ]);
if (jobCards > 0 || invoices > 0 || serviceRequests > 0) { ... }
await prisma.appointment.deleteMany(...);
await prisma.vehicle.delete(...);
```
- _impact_: Same race as customer delete; also misses AmcContract — deleting a vehicle with active AMC leaves orphan contract or FK violation 500.
- _proposed fix_: Use $transaction; add amcContracts to precheck.

### 2. [P1] Mutating routes do not call logActivity (audit gap)
- _id_: `missing-activity-log` · _category_: observability
- _location_: `apps/web/src/app/api/admin/vehicles/[id]/route.ts:17-25, apps/web/src/app/api/admin/amc/plans/route.ts:31-38, apps/web/src/app/api/admin/amc/plans/[id]/route.ts:19-47, apps/web/src/app/api/admin/amc/contracts/route.ts:44-75, apps/web/src/app/api/admin/amc/contracts/[id]/route.ts:24-84, apps/web/src/app/api/admin/amc/contracts/[id]/usages/[usageId]/route.ts:7-19`
- _evidence_:
```
AmcContract POST creates a financial contract but never calls logActivity. AmcContract PATCH/DELETE, AmcPlan POST/PATCH/DELETE, vehicle PATCH (only newValue, no prev), usage POST/DELETE — none log.
```
- _impact_: No audit trail for AMC contract creation, status changes (CANCELLED), service usage (which is essentially money/value), or plan price changes. Compliance + tomorrow's go-live debugging will be blind.
- _proposed fix_: Add `logActivity({...})` calls on every mutating handler, mirror the pattern in customers/route.ts. Capture previousValue for PATCH/DELETE.