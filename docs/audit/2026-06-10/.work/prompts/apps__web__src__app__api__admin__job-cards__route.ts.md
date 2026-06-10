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

Target file: `apps/web/src/app/api/admin/job-cards/route.ts`

## Findings to fix in this file (1)

### 1. [P0 · BLOCKER] POST /job-cards creates job card + invoice + service-request update + vehicle odo update without a transaction
- _id_: `jobcard-create-no-transaction` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/job-cards/route.ts:46-53`
- _evidence_:
```
const jc = await prisma.jobCard.create({ ... });
if (body.serviceRequestId) await prisma.serviceRequest.update({ where: { id: body.serviceRequestId }, data: { status: 'CONVERTED_TO_JOB' } });
if (body.odometerAtIntake) await prisma.vehicle.update({ where: { id: body.vehicleId }, data: { odometerReading: body.odometerAtIntake } });
...
await prisma.invoice.create({ data: invData });
```
- _impact_: If invoice.create or serviceRequest.update fails (FK / unique violation), the job card is persisted but the DRAFT invoice the rest of the UI assumes exists is missing, leaving the job card un-billable and the service-request status stale. Re-submitting causes a second job-card-number with no auto-invoice. Goes live tomorrow with money flow depending on this invariant.
- _proposed fix_: Wrap all four writes in prisma.$transaction(async (tx) => { ... }). Validate referenced ids (customerId/vehicleId/serviceRequestId/appointmentId) inside the tx so FK errors surface before the JobCard row is created.
- _verifier said_: real=True, Confirmed at apps/web/src/app/api/admin/job-cards/route.ts lines 46-51: four independent prisma writes (jobCard.create, serviceRequest.update, vehicle.update, invoice.create) run sequentially with no $transaction wrapper. If invoice.create throws (e.g., unique invoiceNumber collision, FK violation on customerId/vehicleId/createdBy connect), the JobCard row is already persisted but has no companion DRAFT invoice — the rest of the UI assumes this invariant. Retrying the POST burns a second job-card-number and may leave service-request status mis-set. P0 is appropriate given the system goes live tomorrow with money flow depending on the JobCard-Invoice pairing.