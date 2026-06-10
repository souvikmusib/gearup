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

Target file: `apps/web/src/app/api/admin/customers/[id]/route.ts`

## Findings to fix in this file (2)

### 1. [P1 · BLOCKER] Customer DELETE checks counts outside transaction (TOCTOU)
- _id_: `customer-delete-toctou` · _category_: race-condition
- _location_: `apps/web/src/app/api/admin/customers/[id]/route.ts:38-48`
- _evidence_:
```
const [vehicles, jobCards, invoices] = await Promise.all([prisma.vehicle.count(...), prisma.jobCard.count(...), prisma.invoice.count(...)]);
if (vehicles > 0 || jobCards > 0 || invoices > 0) { ... }
await prisma.serviceRequest.deleteMany(...);
await prisma.appointment.deleteMany(...);
await prisma.customer.delete({ where: { id: params.id } });
```
- _impact_: Concurrent POST /vehicles or /job-cards between the count and delete will succeed silently; orphaned children OR cascade-delete loses real records. Worse: schema has `Vehicle.customer ... onDelete: Cascade` — once customer is deleted, ALL vehicles disappear despite the guard.
- _proposed fix_: Wrap entire block in `prisma.$transaction([...])` (interactive tx) and re-count inside the tx; remove `onDelete: Cascade` from Vehicle or make it explicit. Also include amcContracts in the precheck (missing).
- _verifier said_: real=True, Verified in apps/web/src/app/api/admin/customers/[id]/route.ts:35-52. Three count() calls run outside any transaction, then the customer is deleted via separate awaits. Schema confirms Vehicle has `onDelete: Cascade` on the customer relation (schema.prisma:269), so any vehicle inserted via concurrent POST between the count and delete is silently destroyed — the 409 guard provides no real protection. Job cards/invoices use default Restrict, so concurrent inserts of those would instead throw a foreign-key error mid-delete, leaving orphaned serviceRequest/appointment deletions already committed. Also confirmed amcContracts (line 274) is in the precheck list but missing from the count guard. Fix requires wrapping in prisma.$transaction with re-count inside.

### 2. [P1] Customer DELETE does not check for AmcContracts
- _id_: `customer-delete-missing-amc-check` · _category_: data-integrity
- _location_: `apps/web/src/app/api/admin/customers/[id]/route.ts:38-44`
- _evidence_:
```
const [vehicles, jobCards, invoices] = await Promise.all([
  prisma.vehicle.count({ where: { customerId: params.id } }),
  prisma.jobCard.count({ where: { customerId: params.id } }),
  prisma.invoice.count({ where: { customerId: params.id } }),
]);
```
- _impact_: Customer with active AMC contracts can be deleted (no cascade defined on AmcContract.customer either) → FK violation 500, OR if FK allows nulls it leaves dangling contracts.
- _proposed fix_: Add `amcContracts: prisma.amcContract.count(...)` to the precheck and include in error message.